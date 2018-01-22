'use strict';

module.exports = {
  hooks: {
    settings: function(settings, req, cb) {
      cb(null, settings);
    },
    on: {
      called: 0,
      formRequest: function(req, res) {
        this.called = this.called + 1;
        return true;
      }
    },
    alter: {
      called: 0,
      // Synchronous example
      external: function(decoded, req) {
        this.called = this.called + 1;
        return true;
      },
      // Asynchronous example
      user: function(user, cb) {
        this.called = this.called + 1;
        cb(null, user);
      }
    }
  }
};
