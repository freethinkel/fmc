// Custom oxlint rules for the effector models:
//  - sample({...}) must be multiline. oxfmt (objectWrap: preserve) keeps objects expanded once
//    there is a newline before the first property — this rule inserts that newline.
//  - no store.getState(): state reaches an effect as a parameter, never by reading the store.
export default {
  meta: { name: "effector" },
  rules: {
    "no-get-state": {
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.type !== "MemberExpression") return;
            if (node.callee.property.name !== "getState") return;
            context.report({
              node,
              message:
                "getState() is banned — pass the state in as an effect parameter (attach({ source: $store }) or sample's `source`)",
            });
          },
        };
      },
    },
    "sample-multiline": {
      meta: { fixable: "whitespace" },
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.type !== "Identifier" || node.callee.name !== "sample") return;
            const arg = node.arguments[0];

            if (!arg || arg.type !== "ObjectExpression" || arg.properties.length === 0) return;
            if (arg.loc.start.line !== arg.properties[0].loc.start.line) return;
            context.report({
              node: arg,
              message: "sample({...}) should be multiline; run oxfmt after fix",
              fix: (fixer) => fixer.insertTextBefore(arg.properties[0], "\n"),
            });
          },
        };
      },
    },
  },
};
