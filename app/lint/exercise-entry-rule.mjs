import { AST_NODE_TYPES } from '@typescript-eslint/utils';

const transformations = new Map([
  ['src/models/exercise-pick', new Set(['sessionWithPickAdded', 'sessionWithExerciseSwapped'])],
  [
    'src/models/session-models/carry-over',
    new Set(['sessionWithExerciseEdited', 'sessionWithExerciseReplaced', 'nextRecordedExercise']),
  ],
]);
const allowed = new Set(['src/store/stored-sessions/exercise-entry.ts', 'src/services/session-service.ts']);
const previews = new Set([
  'src/components/presentation/workout-editor/progression-preview.ts',
  'src/components/smart/exercise-progression-sheet.tsx',
]);
const fixture = 'src/app/(tabs)/(session)/screenshot-collection.tsx';

/** @param {string} path */
function normalizePath(path) {
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

/** @param {import('@typescript-eslint/utils').TSESTree.Node} node */
function staticName(node) {
  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      return node.name;
    case AST_NODE_TYPES.Literal:
      return typeof node.value === 'string' ? node.value : undefined;
    case AST_NODE_TYPES.TemplateLiteral:
      return node.expressions.length === 0 ? node.quasis[0]?.value.cooked : undefined;
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return staticName(node.expression);
    default:
      return undefined;
  }
}

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'useEntry'>} */
export const exerciseEntryRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      useEntry:
        'ExerciseEntry owns workout add, swap and edit. Use services.exerciseEntry instead of entry transformations.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/').slice(context.cwd.replaceAll('\\', '/').length + 1);
    if (
      /\.spec\.tsx?$/.test(filename) ||
      filename.startsWith('src/models/') ||
      filename.startsWith('src/utils/__test__/') ||
      allowed.has(filename)
    )
      return {};
    /** @param {import('@typescript-eslint/utils').TSESTree.Node} source */
    function restricted(source) {
      const name = staticName(source);
      if (!name) return undefined;
      const path = name.startsWith('@/')
        ? `src/${name.slice(2)}`
        : name.startsWith('.')
          ? `${filename.slice(0, filename.lastIndexOf('/'))}/${name}`
          : undefined;
      return path ? transformations.get(normalizePath(path).replace(/\.[cm]?[jt]sx?$/, '')) : undefined;
    }
    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;
        const names = restricted(node.source);
        if (!names) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind === 'type') continue;
          if (
            specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
            (names.has(staticName(specifier.imported)) &&
              !(previews.has(filename) && staticName(specifier.imported) === 'nextRecordedExercise'))
          )
            context.report({ node: specifier, messageId: 'useEntry' });
        }
      },
      ExportNamedDeclaration(node) {
        if (node.exportKind === 'type') return;
        const names = node.source && restricted(node.source);
        if (!names) return;
        for (const specifier of node.specifiers)
          if (specifier.exportKind !== 'type' && names.has(staticName(specifier.local)))
            context.report({ node: specifier, messageId: 'useEntry' });
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type' && restricted(node.source)) context.report({ node, messageId: 'useEntry' });
      },
      ImportExpression(node) {
        if (restricted(node.source)) context.report({ node, messageId: 'useEntry' });
      },
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'require' &&
          node.arguments[0] &&
          restricted(node.arguments[0])
        )
          context.report({ node, messageId: 'useEntry' });
      },
      MemberExpression(node) {
        if (filename === fixture) return;
        const name =
          node.computed && node.property.type === AST_NODE_TYPES.Identifier ? undefined : staticName(node.property);
        if (name === 'withAddedExercise') context.report({ node, messageId: 'useEntry' });
      },
      ObjectPattern(node) {
        if (filename === fixture) return;
        for (const property of node.properties) {
          if (
            property.type === AST_NODE_TYPES.Property &&
            (!property.computed || property.key.type !== AST_NODE_TYPES.Identifier) &&
            staticName(property.key) === 'withAddedExercise'
          )
            context.report({ node: property, messageId: 'useEntry' });
        }
      },
    };
  },
};

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'compositionRoot'>} */
export const exerciseEntryFactoryRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      compositionRoot:
        'Create ExerciseEntry only in services/index.ts. Use services.exerciseEntry; import its types with import type.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/').slice(context.cwd.replaceAll('\\', '/').length + 1);
    if (
      filename === 'src/services/index.ts' ||
      /\.spec\.tsx?$/.test(filename) ||
      filename.startsWith('src/utils/__test__/')
    )
      return {};
    /** @param {import('@typescript-eslint/utils').TSESTree.Node} source */
    function isFactoryModule(source) {
      const name = staticName(source);
      if (!name) return false;
      const path = name.startsWith('@/')
        ? `src/${name.slice(2)}`
        : name.startsWith('.')
          ? `${filename.slice(0, filename.lastIndexOf('/'))}/${name}`
          : undefined;
      return (
        !!path && normalizePath(path).replace(/\.[cm]?[jt]sx?$/, '') === 'src/store/stored-sessions/exercise-entry'
      );
    }
    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type' || !isFactoryModule(node.source)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== AST_NODE_TYPES.ImportSpecifier || specifier.importKind !== 'type')
            context.report({ node: specifier, messageId: 'compositionRoot' });
        }
        if (!node.specifiers.length) context.report({ node, messageId: 'compositionRoot' });
      },
      ExportNamedDeclaration(node) {
        if (node.exportKind === 'type' || !node.source || !isFactoryModule(node.source)) return;
        for (const specifier of node.specifiers) {
          if (specifier.exportKind !== 'type') context.report({ node: specifier, messageId: 'compositionRoot' });
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type' && isFactoryModule(node.source))
          context.report({ node, messageId: 'compositionRoot' });
      },
      ImportExpression(node) {
        if (isFactoryModule(node.source)) context.report({ node, messageId: 'compositionRoot' });
      },
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'require' &&
          node.arguments[0] &&
          isFactoryModule(node.arguments[0])
        )
          context.report({ node, messageId: 'compositionRoot' });
      },
    };
  },
};
