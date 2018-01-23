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

// setup server
controller.setupWebserver(PORT, (err, webserver) => {
  controller.createWebhookEndpoints(webserver, bot, () => {
    console.log('This bot is online!!!');
  });
});
```
