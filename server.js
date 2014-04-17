var sys = require("sys"),
    http = require("http"),
    path = require("path"),
    url = require("url"),
    fs = require("fs"), //file system
    nerdify = require('./nerdify'),
    video_util = require('./video'),
    handlebars = require("handlebars"),
    Cache = require("node-cache"),
    nerdCache = new Cache();

var template = fs.readFileSync("./index.html", "utf8");

http.createServer(function (request, response) {

    var url_parts = url.parse(request.url, true);
    var my_path = url_parts.pathname;

    if (my_path === '/nerdify') {
        var text = url_parts.query.text;
        var type = url_parts.query.type;
        var video_id = url_parts.query.videoid;
        var vendor = url_parts.query.vendor;
        var cacheKey = vendor + video_id + type;

        var cachedData = nerdCache.get(cacheKey);
        if (cachedData[cacheKey]) {
            sendResponse(200, "application/json", JSON.stringify(cachedData[cacheKey]));
            return;
        }

        nerdify.start(text, type, function (err, data) {
            if (err) {
                console.log(err);
                sendResponse(500, "text/plain", err.message);
            } else {
                nerdCache.set(cacheKey, data);
                sendResponse(200, "application/json", JSON.stringify(data));
            }
        });
    } else if (my_path === '/srt') {
        var video_id = url_parts.query.video_id;
        var vendor = url_parts.query.vendor;

        video_util.getSub(vendor, video_id, function (err, data) {
            if (err) {
                sendResponse(500, "text/plain", data + '');
            } else {
                sendResponse(200, "text/plain", data);
            }
        })
    } else if (my_path == '/video') {

        var source = {
            videoURI: url_parts.query.uri
        };
        var pageBuilder = handlebars.compile(template);
        var pageText = pageBuilder(source);

        sendResponse(200, "text/html", pageText);
    } else {
        var full_path = path.join(process.cwd(), my_path);
        fs.exists(full_path, function (exists) {
            if (!exists) {
                sendResponse(404, "text/plain", "404 Not Found\n");
            }
            else {
                fs.readFile(full_path, "binary", function (err, file) {
                    if (err) {
                        sendResponse(500, "text/plain", err + "\n");
                    }
                    else {
                        sendResponse(200, "auto", file, "binary");
                    }

                });
            }
        });
    }

    function sendResponse(code, content_type, content, format) {
        if (content_type === "auto") {
            response.writeHeader(code);
        } else {
            response.writeHeader(code, {"Content-Type": content_type});
        }

        if (format) {
            response.write(content, format);
        } else {
            response.write(content);
        }
        response.end();
    }
}).listen(8080);
sys.puts("Server Running on 8080");


if (typeof String.prototype.startsWith != 'function') {
    String.prototype.startsWith = function (str) {
        return this.slice(0, str.length) == str;
    };
}
