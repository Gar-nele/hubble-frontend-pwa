module.exports = {
    root: true,
    env: {
        browser: true,
        node: true
    },
    parserOptions: {
        parser: 'babel-eslint'
    },
    extends: [
        'eslint:recommended',
        'plugin:vue/recommended',
        'plugin:prettier/recommended',
        'plugin:nuxt/recommended'
    ],
    plugins: [
        'vue'
    ],
    rules: {
        'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
        'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
        'vue/html-indent': 'off',
        'vue/max-attributes-per-line': 'off',
        "vue/multiline-html-element-content-newline": 'off',
        "vue/singleline-html-element-content-newline" : 'off',
        "vue/no-v-html" : 'off',
    },
    globals: {
        '_': true
    }
}
