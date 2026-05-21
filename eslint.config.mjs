import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='queryRawUnsafe']",
          message:
            'Prohibido $queryRawUnsafe. Usa Prisma.$queryRaw(Prisma.sql`...`) con parámetros.',
        },
        {
          selector: "MemberExpression[property.name='executeRawUnsafe']",
          message:
            'Prohibido $executeRawUnsafe. Usa Prisma.$executeRaw(Prisma.sql`...`) con parámetros.',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
