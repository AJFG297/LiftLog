import { AST_NODE_TYPES } from '@typescript-eslint/utils';

/**
 * @param {import('@typescript-eslint/utils').TSESTree.Node} node
 * @returns {string | undefined}
 */
function staticPropertyName(node) {
  switch (node.type) {
    case AST_NODE_TYPES.Literal:
      return typeof node.value === 'string' ? node.value : undefined;
    case AST_NODE_TYPES.TemplateLiteral:
      return node.expressions.length === 0 ? (node.quasis[0]?.value.cooked ?? undefined) : undefined;
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return staticPropertyName(node.expression);
    default:
      return undefined;
  }
}

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'useAtomicHelper'>} */
export const storageTransactionRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      useAtomicHelper: 'Use writeAtomically from @/db/helpers. Device transactions are synchronous.',
    },
  },
  create(context) {
    /**
     * @param {import('@typescript-eslint/utils').TSESTree.Node} node
     * @param {import('@typescript-eslint/utils').TSESTree.Node} key
     * @param {boolean} computed
     */
    function check(node, key, computed) {
      const name = !computed && key.type === AST_NODE_TYPES.Identifier ? key.name : staticPropertyName(key);
      if (name === 'transaction') {
        context.report({ node, messageId: 'useAtomicHelper' });
      }
    }
    return {
      MemberExpression(node) {
        check(node, node.property, node.computed);
      },
      ObjectPattern(node) {
        for (const property of node.properties) {
          if (property.type === AST_NODE_TYPES.Property) {
            check(property, property.key, property.computed);
          }
        }
      },
    };
  },
};
