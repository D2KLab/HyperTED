/*
 * Merge two or more objects.
 * i.e. var out = mergeObj(in1, in2, ...);
 *
 * Object attributes are merged too.
 * Primitive types values are overwritten by the last one.
 */
exports.mergeObj = function () {
    var mObj = {};
    for (var o in arguments) {
        if (arguments.hasOwnProperty(o)) {
            var obj = arguments[o];
            for (var attrname in obj) {
                if (obj.hasOwnProperty(attrname)) {
                    mObj[attrname] = obj[attrname];
                }
            }
        }
    }
    return mObj;
};

var http = require('http');
var https = require('https');
if (!http.getRemoteFile) {
    http.getRemoteFile = function (url, callback) {
        var protocol = http;
        if (url.startsWith('https'))
            protocol = https;

        protocol.get(url, function (res) {
            if (res.statusCode != 200) {
                callback(res.statusCode, res.statusCode);
                return;
            }

            var body = '';
            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {
                if (body == '') {
                    callback(true, 'Empty Response');
                    return;
                }
                callback(false, body);
            });
        });
    };
}

if (!http.getJSON) {
    http.getJSON = function (url, callback) {
        http.getRemoteFile(url, function (err, body) {
            if (err) {
                callback(err, body);
                return;
            }
            body = body.substring(body.indexOf('{'), body.lastIndexOf('}') + 1);
            body = JSON.parse(body);
            callback(null, body);
        });
    };
}