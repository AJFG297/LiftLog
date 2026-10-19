import { AST_NODE_TYPES } from '@typescript-eslint/utils';

const owners = new Map([
  ['src/services/program-writer', new Set(['src/services/index.ts', 'src/services/history-import.ts'])],
  ['src/services/descriptor-writer', new Set(['src/services/index.ts', 'src/services/history-import.ts'])],
  [
    'src/store/history-import-actions',
    new Set([
      'src/services/history-import.ts',
      'src/store/program/index.ts',
      'src/store/program/effects.ts',
      'src/store/stored-sessions/index.ts',
      'src/store/stats/effects.ts',
    ]),
  ],
]);

/** @param {string} path */
function normalizePath(path) {
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'useOwner'>} */
export const importOwnershipRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      useOwner:
        'HistoryImport owns import composition and writer queues. Use extra.historyImport.apply or the writer flush API.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/').slice(context.cwd.replaceAll('\\', '/').length + 1);
    if (/\.spec\.tsx?$/.test(filename) || filename.startsWith('src/utils/__test__/')) return {};
    /** @param {import('@typescript-eslint/utils').TSESTree.Node | null | undefined} source */
    function check(source) {
      if (!source || source.type !== AST_NODE_TYPES.Literal || typeof source.value !== 'string') return;
      const name = source.value;
      const target = name.startsWith('@/')
        ? `src/${name.slice(2)}`
        : name.startsWith('.')
          ? `${filename.slice(0, filename.lastIndexOf('/'))}/${name}`
          : undefined;
      if (!target) return;
      const module = normalizePath(target).replace(/\.[cm]?[jt]sx?$/, '');
      const allowed = owners.get(module);
      if (allowed && !allowed.has(filename)) context.report({ node: source, messageId: 'useOwner' });
    }
    return {
      ImportDeclaration(node) {
        check(node.source);
      },
      ExportNamedDeclaration(node) {
        check(node.source);
      },
      ExportAllDeclaration(node) {
        check(node.source);
      },
      ImportExpression(node) {
        check(node.source);
      },
      CallExpression(node) {
        if (node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'require') check(node.arguments[0]);
      },
    };
  },
};
