var http = require('http');

retriveXml = function () {
    http.get("http://www.youtube.com/api/timedtext?lang=en&v=CKCvf8E7V1g", function (res) {
        console.log("Got response: " + res.statusCode);
        res.on("data", function (chunk) {
            console.log("BODY: " + chunk);
        });
        return 'done';
    }).on('error', function (e) {
        console.log("Got error: " + e.message);
    });
}

exports.retriveXml = retriveXml();