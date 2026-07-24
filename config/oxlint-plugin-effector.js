// Custom oxlint rule: sample({...}) must be multiline.
// oxfmt (objectWrap: preserve) keeps objects expanded once there is a newline
// before the first property — this rule inserts that newline, oxfmt does the rest.
export default {
  meta: { name: "effector" },
  rules: {
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
