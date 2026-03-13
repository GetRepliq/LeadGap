import esbuild from 'esbuild';

const emptyModulePlugin = {
  name: 'empty-module',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, (args) => {
      return { path: args.path, namespace: 'empty-module' };
    });

    build.onLoad({ filter: /.*/, namespace: 'empty-module' }, () => {
      return { contents: 'export default {};', loader: 'js' };
    });
  },
};

esbuild.build({
  entryPoints: ['tanner.tsx'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/main.js',
  format: 'esm',
  external: ['dotenv'], // Keep dotenv to external
  plugins: [emptyModulePlugin],
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`
  },
}).catch(() => process.exit(1));
