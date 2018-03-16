'use strict';

module.exports = (router) => {
  return {
    adsync: require('./adsync')(router),
    import: require('./import')(router),
    export: require('./export')(router)
  };
};
