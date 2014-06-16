var https = require('https')
var fs = require('fs')
var url = require("url")
var path = require("path")
var options = {
  key: fs.readFileSync('./certs/server.key'),
  cert: fs.readFileSync('./certs/server.crt')
};

https.createServer(options, function (req, res) {
  var uri = url.parse(req.url).pathname
  var filename = path.join(process.cwd(), uri)

  console.log(uri, filename)

  path.exists(filename, function(exists) {
    if(!exists) {
      res.writeHead(404, {"Content-Type": "text/plain"})
      res.write("404 Not Found\n")
      res.end()
      return;
    }

    if (fs.statSync(filename).isDirectory()) filename += '/index.html'

    fs.readFile(filename, "binary", function(err, file) {
      if(err) {        
        res.writeHead(500, {"Content-Type": "text/plain"})
        res.write(err + "\n")
        res.end()
        return;
      }

      res.writeHead(200)
      res.write(file, "binary")
      res.end()
    });
  });
}).listen(8000)