// Used only by Jest (Vite handles JSX itself during dev and build).
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
  plugins: ['babel-plugin-transform-vite-meta-env'],
};
