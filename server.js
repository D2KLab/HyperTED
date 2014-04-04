var sys = require("sys"),
    my_http = require("http"),
    path = require("path"),
    url = require("url"),
    filesys = require("fs"),
    nerd = require('./nerd');

my_http.createServer(function (request, response) {
    var my_path = url.parse(request.url).pathname;

    if (my_path === '/nerd') {
        nerd.start(function (err, data) {
            if (err){
                sendResponse(500, "text/plain", data);
            }else{
                sendResponse(200, "text/plain", JSON.stringify(data));
            }
        });
    } else {

        var full_path = path.join(process.cwd(), my_path);
        filesys.exists(full_path, function (exists) {
            if (!exists) {
                sendResponse(404, "text/plain", "404 Not Found\n");
            }
            else {
                filesys.readFile(full_path, "binary", function (err, file) {
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
