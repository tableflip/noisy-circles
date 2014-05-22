/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var audioContext = new AudioContext();
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var detectorElem,
  flashElem;
var WIDTH = 300;
var CENTER = 150;
var HEIGHT = 42;
var confidence = 0;
var currentPitch = 0;
var particles = [];
var colors = [
  "#00306F",
  "#00306F",
  "#00306F",
  "#1BA5E4",
  "#0086C5",
  "#8BFFFF",
  "#FFFFFF",
  "#00306F",
  "#0063A2",
  "#00306F",
  "#007CBB",
  "#72FCFF"
]
var volume = -35

window.onload = function() {
  var request = new XMLHttpRequest();
  request.open("GET", "../sounds/whistling3.ogg", true);
  request.responseType = "arraybuffer";
  request.onload = function() {
    audioContext.decodeAudioData(request.response, function(buffer) {
      theBuffer = buffer;
    });
  }
  request.send();

  detectorElem = document.body;
  flashElem = document.getElementById("flash")

  //Initializing the canvas
  var canvas = document.getElementById("canvas");

  setInterval(function() {
    draw(canvas)
  }, 33)

  toggleLiveInput()
}

  function error() {
    alert('Stream generation failed.');
  }

  function getUserMedia(dictionary, callback) {
    try {
      navigator.getUserMedia =
        navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia;
      navigator.getUserMedia(dictionary, callback, error);
    } catch (e) {
      alert('getUserMedia threw exception :' + e);
    }
  }

  function gotStream(stream) {
    // Create an AudioNode from the stream.
    var mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Connect it to the destination.
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    mediaStreamSource.connect(analyser);
    updatePitch();

    // processor.onaudioprocess = function(e) {
    //   var out = e.outputBuffer.getChannelData(0);
    //   var int = e.inputBuffer.getChannelData(0);
    //   var max = 0;

    //   for (var i = 0; i < int.length; i++) {
    //     out[i] = int[i]; //prevent feedback and we only need the input data
    //     max = int[i] > max ? int[i] : max;
    //   }
    //   //convert from magitude to decibel
    //   var db = 20 * Math.log(Math.max(max, Math.pow(10, -72 / 20))) / Math.LN10;
    //   //It's time to draw on the canvas
    //   //create the gradient
    //   console.log(db)

    //   // var grad = ctx.createLinearGradient(w / 10, h * 0.2, w / 10, h * 0.95);
    //   // grad.addColorStop(0, 'red');
    //   // grad.addColorStop(-6 / -72, 'yellow');
    //   // grad.addColorStop(1, 'green');
    //   // //fill the background
    //   // ctx.fillStyle = '#555';
    //   // ctx.fillRect(0, 0, w, h);
    //   // ctx.fillStyle = grad;
    //   // //draw the rectangle
    //   // ctx.fillRect(w / 10, h * 0.8 * (db / -72), w * 8 / 10, (h * 0.95) - h * 0.8 * (db / -72));
    //   // //draw the text out
    //   // ctx.fillStyle = "white";
    //   // ctx.font = "Arial 12pt";
    //   // ctx.textAlign = "center";
    //   // ctx.fillText(Math.round(db * 100) / 100 + ' dB', w / 2, h - h * 0.025);
    // };
  }

  function toggleLiveInput() {
    getUserMedia({
      audio: true
    }, gotStream);
  }

var rafID = null;
var tracks = null;
var buflen = 2048;
var buf = new Uint8Array(buflen);
var MINVAL = 134; // 128 == zero.  MINVAL is the "minimum detected signal" level.

var noteStrings = ["c", "csharp", "d", "dsharp", "e", "f", "fsharp", "g", "gsharp", "a", "asharp", "b"];

function noteFromPitch(frequency) {
  var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  return Math.round(noteNum) + 69;
}

function frequencyFromNoteNumber(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function centsOffFromPitch(frequency, note) {
  return (1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
}

function autoCorrelate(buf, sampleRate) {
  var MIN_SAMPLES = 4; // corresponds to an 11kHz signal
  var MAX_SAMPLES = 1000; // corresponds to a 44Hz signal
  var SIZE = 1000;
  var best_offset = -1;
  var best_correlation = 0;
  var rms = 0;

  confidence = 0;
  currentPitch = 0;

  if (buf.length < (SIZE + MAX_SAMPLES - MIN_SAMPLES))
    return; // Not enough data

  for (var i = 0; i < SIZE; i++) {
    var val = (buf[i] - 128) / 128;
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);

  for (var offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
    var correlation = 0;

    for (var i = 0; i < SIZE; i++) {
      correlation += Math.abs(((buf[i] - 128) / 128) - ((buf[i + offset] - 128) / 128));
    }
    correlation = 1 - (correlation / SIZE);
    if (correlation > best_correlation) {
      best_correlation = correlation;
      best_offset = offset;
    }
  }
  if ((rms > 0.01) && (best_correlation > 0.01)) {
    confidence = best_correlation * rms * 10000;
    currentPitch = sampleRate / best_offset;
  }
}

function updatePitch(time) {
  var array = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(array);

  volume = getAverageVolume(array)
  console.log('VOLUME:' + volume); //here's the volume
  // possible other approach to confidence: sort the array, take the median; go through the array and compute the average deviation
  analyser.getByteTimeDomainData(buf);
  autoCorrelate(buf, audioContext.sampleRate);

  //  detectorElem.className = (confidence>50)?"confident":"vague";

  if (confidence < 90) {
    //detectorElem.className = "vague";
  } else {
    //flash_screen(canvas)
    var note = noteFromPitch(currentPitch);
    //for (i = 0; i < 3; i++) {
    particles.push(new create_particle(canvas, note % 12));
    //}
    var detune = centsOffFromPitch(currentPitch, note);
    if (detune == 0) {

    } else {
      if (Math.abs(detune) < 10) {
        //canvasContext.fillStyle = "green";
      } else {
        //canvasContext.fillStyle = "red";
      }

      if (detune < 0) {
        // detuneElem.className = "flat";
      } else {
        // detuneElem.className = "sharp";
      }
    }
  }

  if (!window.requestAnimationFrame)
    window.requestAnimationFrame = window.webkitRequestAnimationFrame;
  rafID = window.requestAnimationFrame(updatePitch);
}

//Lets animate the particle

function draw(canvas) {
  var ctx = canvas.getContext("2d");
  var W = canvas.width
  var H = canvas.height
  //Lets reduce the opacity of the BG paint to give the final touch
  ctx.fillStyle = "#085277";
  ctx.fillRect(0, 0, W, H);

  //Lets blend the particle with the BG
  ctx.globalCompositeOperation = "source-over";

  //Lets draw particles from the array now
  for (var t = 0; t < particles.length; t++) {
    var p = particles[t];

    ctx.beginPath();

    ctx.arc(p.x, p.y, volume / 10, Math.PI * 2, false);
    ctx.fillStyle = p.color;
    ctx.fill();

    p.x += p.vx;
    p.y += p.vy;

    // delete particles once they've moved out of the canvas
    if (p.x < -50 || p.y < -50 || p.x > W + 50 || p.y > H + 50) particles.splice(t, 1)
  }
}

// Creates a particle

function create_particle(canvas, radius) {
  var W = canvas.width
  var H = canvas.height
  // Center on the canvas
  this.x = W / 2;
  this.y = H / 2;
  // Let's add random velocity to each particle
  this.vx = Math.random() * 40 - 20;
  this.vy = Math.random() * 40 - 20;
  this.color = colors[radius];

  //Random size
  this.radius = radius;
}

function flash_screen(canvas) {
  flashElem.className = "white"
  setTimeout(function() {
    flashElem.className = ""
  }, 10)
}

function getAverageVolume(array) {
  var values = 0;
  var average;

  var length = array.length;

  // get all the frequency amplitudes
  for (var i = 0; i < length; i++) {
    values += array[i];
  }

  average = values / length;
  return average;
}
