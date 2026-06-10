module.exports = {
    '*.(ts|js|vue|scss|css)': ['prettier --write'],
    '*.(ts|js|vue)': ['oxlint'],
    '*.(scss|vue)': ['stylelint --allow-empty-input'],
};
