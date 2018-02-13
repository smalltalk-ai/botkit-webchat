# botkit-webchat


## Setup

```js
var Botkit = require('botkit');
var Webchatbot = require('botkit-webchat').WebchatIOBot;
var controller = Webchatbot(Botkit, {
  debug: false,
  log: true,
  receive_via_postback: true,
  pageId: '123'
});
var bot = controller.spawn({});

// set menu
controller.api.thread_settings.menu([
  {
    type: 'postback',
    title: 'Help',
    payload: 'clicked-help'
  }
]);

// setup server - using botkit setupWebserver
controller.setupWebserver(PORT, (err, webserver) => {
  var server = require('http').Server(webserver);
  controller.createWebhookEndpoints(server, bot, () => {
    console.log('This bot is online!!!');
  });
});

// setup server - using express
var app = require('express')();
var server = require('http').Server(app);
server.listen(80);

controller.createWebhookEndpoints(server, bot, () => {
  console.log('This bot is online!!!');
});
```
