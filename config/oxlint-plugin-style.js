// Custom oxlint rule: require a blank line after a group of variable declarations.
// A run of consecutive const/let/var (or `export const ...`) must be followed by a
// blank line before the next non-declaration statement. oxfmt preserves the blank line.
const isVarDecl = (n) =>
  n.type === "VariableDeclaration" ||
  (n.type === "ExportNamedDeclaration" && n.declaration?.type === "VariableDeclaration");

export default {
  meta: { name: "style" },
  rules: {
    "blank-line-after-vars": {
      meta: { fixable: "whitespace" },
      create(context) {
        const check = (statements) => {
          for (let i = 0; i < statements.length - 1; i++) {
            const cur = statements[i];
            const next = statements[i + 1];

            if (!isVarDecl(cur) || isVarDecl(next)) continue;
            // blank line = at least one empty line between them
            if (next.loc.start.line - cur.loc.end.line >= 2) continue;
            context.report({
              node: next,
              message: "Expected a blank line after variable declarations",
              fix: (fixer) => fixer.insertTextBefore(next, "\n"),
            });
          }
        };

        return {
          Program: (n) => check(n.body),
          BlockStatement: (n) => check(n.body),
          StaticBlock: (n) => check(n.body),
          SwitchCase: (n) => check(n.consequent),
        };
      },
    },
  },
};
