const ReplaceInFileWebpackPlugin = require('replace-in-file-webpack-plugin');

const packageJson = require('./package.json');

module.exports.getWebpackConfig = (config, options) => {
  const compressOptions = { drop_console: false, drop_debugger: false };
  return {
    ...config,
    plugins: [...config.plugins, new ReplaceInFileWebpackPlugin([
      {
        dir: 'dist',
        files: ['plugin.json'],
        rules: [
          {
            search: /\%VERSION\%/g,
            replace: packageJson.version,
          }
        ],
      },
    ]),],
  };
};
