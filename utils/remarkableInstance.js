const { Remarkable } = require('remarkable');
const md = new Remarkable({ html: true, linkify: true });

module.exports = md;