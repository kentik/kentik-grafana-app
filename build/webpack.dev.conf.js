const baseWebpackConfig = require('./webpack.base.conf');

var conf = baseWebpackConfig;
conf.watch = true;
conf.watchOptions = {
  poll: 1000,
  ignored: ['src/**/*.js', 'node_modules']
};
conf.mode = 'development';
conf.devtool = 'inline-source-map';

module.exports = baseWebpackConfig;
