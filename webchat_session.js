/* jshint node: true */
'use strict';

var uuid = require('uuid');

module.exports = function(req, res, next) {
  // set a sessionid if one is not passed in
  let
    data = req.body,
    sessionId = (data && data.id && data.id !== 'null') ?
      data.id :
      null
  ;

  if (sessionId === null) {
    data.id = uuid.v4();
  }

  next();
};
