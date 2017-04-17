'use strict';

/**
 ** Change directory so this program can run as a service.
 **/
process.chdir(__dirname);

var fs = require("fs");
var service = require("os-service");

/*eslint-disable no-console */
function usage() {
    console.log("usage: node service --add <name> [username] [password]");
    console.log("       node service --remove <name>");
    console.log("       node service --run");
    process.exit(-1);
}

if (process.argv[2] === "--add" && process.argv.length >= 4) {
    var options = {
        //	nodeArgs: ['--debug=34343', '--expose-debug-as=v8debug'],
        programArgs: ["--run"]
    };

    if (process.argv.length > 4) {
        options.username = process.argv[4];
    }

    if (process.argv.length > 5) {
        options.password = process.argv[5];
    }

    service.add(process.argv[3], options, function(error) {
        if (error) {
            console.log(error.toString());
        }
    });
}
else if (process.argv[2] === "--remove" && process.argv.length >= 4) {
    service.remove(process.argv[3], function(error) {
        if (error) {
            console.log(error.toString());
        }
    });
}
else if (process.argv[2] === "--run") {
    var logStream = fs.createWriteStream(process.argv[1] + ".log");
    service.run(logStream, function() {
        service.stop(0);
    });

    var util = require('./src/util/util');
    require('colors');
    require('./server')().then(function(state) {
        util.log(' > Serving the Form.io API Platform at ' + state.config.domain.green);
        state.server.listen(state.config.port);
    });
}
else {
    usage();
}
