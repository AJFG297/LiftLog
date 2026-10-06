import { transform } from 'esbuild';
import { defineConfig, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const directory = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: directory,
  plugins: [
    {
      name: 'native-package-web-transforms',
      enforce: 'pre',
      async transform(code, id) {
        if (id.startsWith(resolve(directory, '../src')) && /\.tsx?$/.test(id))
          return await transform(code, {
            loader: id.endsWith('.tsx') ? 'tsx' : 'ts',
            jsx: 'automatic',
            sourcemap: 'inline',
            target: 'esnext',
          });
        if (id.endsWith('/expo-modules-core/src/ts-declarations/global.ts'))
          return { code: 'export {};', moduleType: 'js' };
        if (id.includes('/react-native-vector-icons/') && id.endsWith('.js')) {
          return { ...(await transformWithOxc(code, id, { lang: 'jsx' })), moduleType: 'js' };
        }
      },
    },
    react({ babel: { plugins: ['react-native-worklets/plugin'] } }),
  ],
  optimizeDeps: {
    rolldownOptions: {
      plugins: [
        {
          name: 'expo-declarations',
          transform(_code, id) {
            if (id.endsWith('/expo-modules-core/src/ts-declarations/global.ts'))
              return { code: 'export {};', moduleType: 'js' };
          },
        },
      ],
      moduleTypes: { '.js': 'jsx' },
      resolve: {
        extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
      },
    },
  },
  oxc: { typescript: { onlyRemoveTypeImports: false } },
  define: {
    global: 'globalThis',
    __DEV__: 'false',
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      ...[
        'react-native-gesture-handler',
        'react-native-reanimated',
        'react-native-worklets',
        'react-native-safe-area-context',
      ].map((name) => ({
        find: new RegExp(`^${name}$`),
        replacement: resolve(
          directory,
          `../node_modules/${name}/src/index.${name === 'react-native-safe-area-context' ? 'tsx' : 'ts'}`,
        ),
      })),
      {
        find: /^@\/models\/session-models$/,
        replacement: resolve(directory, 'adapters/session-models.ts'),
      },
      { find: /^@\/store$/, replacement: resolve(directory, 'store.ts') },
      { find: /^expo-router$/, replacement: resolve(directory, 'adapters/navigation.ts') },
      {
        find: /^@pchmn\/expo-material3-theme$/,
        replacement: resolve(directory, 'adapters/material-theme.ts'),
      },
      { find: /^expo-localization$/, replacement: resolve(directory, 'adapters/localization.ts') },
      {
        find: /^@\/components\/presentation\/foundation\/haptics$/,
        replacement: resolve(directory, 'adapters/haptics.ts'),
      },
      { find: '@', replacement: resolve(directory, '../src') },
    ],
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    mainFields: ['browser', 'module', 'main'],
    dedupe: ['react', 'react-dom'],
  },
  server: { host: '127.0.0.1', strictPort: true, fs: { allow: [resolve(directory, '..')] } },
});
