// This library allows us to combine paths easily
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: path.resolve(__dirname, 'src', 'index.jsx'),

    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js'
    },
    plugins: [
        // Takes the src/index.html and builds it in dist
        new HtmlWebpackPlugin({
            hash: true,
            template: path.resolve(__dirname, 'src', 'index.html'),
        })
    ],
    devServer: {
        // Where webpack-dev-server serves bundle which is created in memory. <script> src should point to this path
        publicPath: '/dist/',

        // Local filesystem directory where static html files are served
        contentBase: path.resolve(__dirname, 'src'),

        // Live reloading is not useful for this kind of app
        hot: false,
        inline: false
    },
    resolve: {
        extensions: ['.js', '.jsx', '.mjs']
    },
    module: {
        rules: [
            {
                test: /\.jsx/,
                use: {
                    loader: 'babel-loader',
                    options: { presets: ['@babel/preset-react', '@babel/preset-env'] }
                }
            },
            {
                test: /\.mjs$/, // Needed this for overlayscrollbars
                include: /node_modules/,
                type: 'javascript/auto'
            },
            {
                test: /\.scss/,
                use: ['style-loader', 'css-loader', 'postcss-loader', 'sass-loader'] // Note that postcss loader must come before sass-loader
            },
            {
                test: /\.css$/,
                use: [ 'style-loader', 'css-loader', 'postcss-loader' ]
            },
            {
                test: /\.woff/,
                loader: "url-loader?limit=10000&mimetype=application/font-woff"
            }, {
                test: /\.(ttf|eot|svg)/,
                loader: "file-loader"
            }
        ]
    }
};
