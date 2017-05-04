'use strict';

var fs      = require('fs');
var http    = require('http');
var https   = require('https');
var options = {
  key:  fs.readFileSync('./ssl/server.key'),
  cert: fs.readFileSync('./ssl/server.crt')
};

var util = require('./src/util/util');
require('colors');
require('./server')().then(function(state) {
  util.log(' > Serving the Form.io API Platform at ' + state.config.domain.green);
//state.server.listen(state.config.port);
  http.createServer(state.server).listen(state.config.port, state.config.host);
  https.createServer(options, state.server).listen(state.config.sslPort, state.config.host);
});
