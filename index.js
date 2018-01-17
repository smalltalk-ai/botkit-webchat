var Webchatbot = require('./webchatbot');
var WebchatIOBot = require('./webchatiobot');

var bots = Webchatbot;
bots.Webchatbot = Webchatbot;
bots.WebchatIOBot = WebchatIOBot;

module.exports = bots;
