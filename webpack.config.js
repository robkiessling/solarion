// This library allows us to combine paths easily
const path = require('path');
module.exports = {
    entry: path.resolve(__dirname, 'src', 'index.jsx'),
    devServer: {
        contentBase: './src',
        publicPath: '/output',

        // Live reloading is not useful for this kind of app
        hot: false,
        inline: false
    },
    output: {
        path: path.resolve(__dirname, 'output'),
        filename: 'bundle.js'
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
            }
        ]
    }
};
