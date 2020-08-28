// This library allows us to combine paths easily
const path = require('path');
module.exports = {
    entry: path.resolve(__dirname, 'src', 'index.jsx'),

    output: {
        path: path.resolve(__dirname, 'output'),
        filename: 'bundle.js'
    },

    devServer: {
        // Where webpack-dev-server serves bundle which is created in memory. <script> src should point to this path
        publicPath: '/output/',

        // Local filesystem directory where static html files are served
        contentBase: path.resolve(__dirname, 'src'),

        // Live reloading is not useful for this kind of app
        hot: false,
        inline: false
    },
    resolve: {
        extensions: ['.js', '.jsx']
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
