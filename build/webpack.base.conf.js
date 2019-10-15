const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

const ngAnnotatePlugin = require('ng-annotate-webpack-plugin');
const ReplaceInFileWebpackPlugin = require('replace-in-file-webpack-plugin');


const NODE_MODULES_REG_EXP = /node_modules/;

const ExtractTextPluginLight = new ExtractTextPlugin('./styles/light.css');
const ExtractTextPluginDark = new ExtractTextPlugin('./styles/dark.css');

function resolve(dir) {
  return path.join(__dirname, '..', dir);
}

const packageJson = require('../package.json');

module.exports = {
  target: 'node',
  context: resolve('src'),
  entry: {
    './module': './module.ts',
    'datasource/module': './datasource/module.ts',
    'panel/call-to-action/module': './panel/call-to-action/module.ts',
    'panel/device-list/module': './panel/device-list/module.ts',
  },
  output: {
    filename: '[name].js',
    path: resolve('dist'),
    libraryTarget: 'amd'
  },
  externals: [
    // remove the line below if you don't want to use buildin versions
    'jquery', 'lodash', 'moment', 'angular',
    function (context, request, callback) {
      var prefix = 'grafana/';
      if (request.indexOf(prefix) === 0) {
        return callback(null, request.substr(prefix.length));
      }
      callback();
    }
  ],
  plugins: [
    new webpack.optimize.OccurrenceOrderPlugin(),
    new CopyWebpackPlugin([
      { from: '../README.md' },
      { from: '../CHANGELOG.md' },
      { from: '**/plugin.json' },
      { from: 'panel/**/*.html' },
      { from: 'datasource/**/*.html' },
      { from: 'components/**/*.html' },
      { from: 'dashboards/*' },
      { from: 'img/*' },
    ]),

    new ReplaceInFileWebpackPlugin([
      {
        dir: 'dist',
        files: ['plugin.json'],
        rules: [
          {
            search: '%VERSION%',
            replace: packageJson.version,
          },
          {
            search: '%TODAY%',
            replace: new Date().toISOString().substring(0, 10),
          },
        ],
      },
    ]),

    ExtractTextPluginLight,
    ExtractTextPluginDark,

    new CleanWebpackPlugin(['dist'], {
      root: resolve('.')
    }),
    new ngAnnotatePlugin()
  ],
  resolve: {
    extensions: ['.js', '.ts', '.html', '.scss'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [NODE_MODULES_REG_EXP],
        loaders: [
          'ts-loader'
        ],
      },
      {
        test: /\.html$/,
        exclude: [NODE_MODULES_REG_EXP],
        use: {
          loader: 'html-loader'
        },
      },
      {
        test: /\.scss$/,
        exclude: [NODE_MODULES_REG_EXP, /dark\.scss/, /light\.scss/],
        use: ['style-loader', 'css-loader', 'sass-loader']
      },
      {
        test: /light\.scss$/,
        exclude: [NODE_MODULES_REG_EXP],
        use: ExtractTextPluginLight.extract({
          fallback: 'style-loader',
          use: ['css-loader', 'sass-loader']
        }),
      },
      {
        test: /dark\.scss$/,
        exclude: [NODE_MODULES_REG_EXP],
        use: ExtractTextPluginDark.extract({
          fallback: 'style-loader',
          use: ['css-loader', 'sass-loader']
        }),
      }
    ]
  }
}
