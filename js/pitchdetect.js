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

  setInterval(function () {
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
  analyser.fftSize = 2048;
  mediaStreamSource.connect(analyser);
  updatePitch();
}

function toggleLiveInput() {
  getUserMedia({
    audio: true
  }, gotStream);
}

function togglePlayback() {
  var now = audioContext.currentTime;

  if (isPlaying) {
    //stop playing and return
    sourceNode.stop(now);
    sourceNode = null;
    analyser = null;
    isPlaying = false;
    if (!window.cancelAnimationFrame)
      window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
    window.cancelAnimationFrame(rafID);
    return "start";
  }

  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = theBuffer;
  sourceNode.loop = true;

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  sourceNode.connect(analyser);
  analyser.connect(audioContext.destination);
  sourceNode.start(now);
  isPlaying = true;
  isLiveInput = false;
  updatePitch();

  return "stop";
}

var rafID = null;
var tracks = null;
var buflen = 2048;
var buf = new Uint8Array(buflen);
var MINVAL = 134; // 128 == zero.  MINVAL is the "minimum detected signal" level.

/*
function findNextPositiveZeroCrossing( start ) {
  var i = Math.ceil( start );
  var last_zero = -1;
  // advance until we're zero or negative
  while (i<buflen && (buf[i] > 128 ) )
    i++;
  if (i>=buflen)
    return -1;

  // advance until we're above MINVAL, keeping track of last zero.
  while (i<buflen && ((t=buf[i]) < MINVAL )) {
    if (t >= 128) {
      if (last_zero == -1)
        last_zero = i;
    } else
      last_zero = -1;
    i++;
  }

  // we may have jumped over MINVAL in one sample.
  if (last_zero == -1)
    last_zero = i;

  if (i==buflen)  // We didn't find any more positive zero crossings
    return -1;

  // The first sample might be a zero.  If so, return it.
  if (last_zero == 0)
    return 0;

  // Otherwise, the zero might be between two values, so we need to scale it.

  var t = ( 128 - buf[last_zero-1] ) / (buf[last_zero] - buf[last_zero-1]);
  return last_zero+t;
}
*/

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

// this is a float version of the algorithm below - but it's not currently used.
/*
function autoCorrelateFloat( buf, sampleRate ) {
  var MIN_SAMPLES = 4;  // corresponds to an 11kHz signal
  var MAX_SAMPLES = 1000; // corresponds to a 44Hz signal
  var SIZE = 1000;
  var best_offset = -1;
  var best_correlation = 0;
  var rms = 0;

  if (buf.length < (SIZE + MAX_SAMPLES - MIN_SAMPLES))
    return -1;  // Not enough data

  for (var i=0;i<SIZE;i++)
    rms += buf[i]*buf[i];
  rms = Math.sqrt(rms/SIZE);

  for (var offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
    var correlation = 0;

    for (var i=0; i<SIZE; i++) {
      correlation += Math.abs(buf[i]-buf[i+offset]);
    }
    correlation = 1 - (correlation/SIZE);
    if (correlation > best_correlation) {
      best_correlation = correlation;
      best_offset = offset;
    }
  }
  if ((rms>0.1)&&(best_correlation > 0.1)) {
    console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")");
  }
//  var best_frequency = sampleRate/best_offset;
}
*/

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
    // console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
  }
  //  var best_frequency = sampleRate/best_offset;
}

function updatePitch(time) {
  var cycles = new Array;
  analyser.getByteTimeDomainData(buf);

  /*
// old zero-crossing code

  var i=0;
  // find the first point
  var last_zero = findNextPositiveZeroCrossing( 0 );

  var n=0;
  // keep finding points, adding cycle lengths to array
  while ( last_zero != -1) {
    var next_zero = findNextPositiveZeroCrossing( last_zero + 1 );
    if (next_zero > -1)
      cycles.push( next_zero - last_zero );
    last_zero = next_zero;

    n++;
    if (n>1000)
      break;
  }

  // 1?: average the array
  var num_cycles = cycles.length;
  var sum = 0;
  var pitch = 0;

  for (var i=0; i<num_cycles; i++) {
    sum += cycles[i];
  }

  if (num_cycles) {
    sum /= num_cycles;
    pitch = audioContext.sampleRate/sum;
  }

// confidence = num_cycles / num_possible_cycles = num_cycles / (audioContext.sampleRate/)
  var confidence = (num_cycles ? ((num_cycles/(pitch * buflen / audioContext.sampleRate)) * 100) : 0);
  */

  /*
  console.log( 
    "Cycles: " + num_cycles + 
    " - average length: " + sum + 
    " - pitch: " + pitch + "Hz " +
    " - note: " + noteFromPitch( pitch ) +
    " - confidence: " + confidence + "% "
    );
*/
  // possible other approach to confidence: sort the array, take the median; go through the array and compute the average deviation
  autoCorrelate(buf, audioContext.sampleRate);

  //  detectorElem.className = (confidence>50)?"confident":"vague";

  if (confidence < 10) {
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

  function draw (canvas) {
    var ctx = canvas.getContext("2d");
    var W = canvas.width
    var H = canvas.height
    //Lets reduce the opacity of the BG paint to give the final touch
    ctx.fillStyle = "#25afee";
    ctx.fillRect(0, 0, W, H);

    //Lets blend the particle with the BG
    ctx.globalCompositeOperation = "source-over";

    //Lets draw particles from the array now
    for (var t = 0; t < particles.length; t++) {
      var p = particles[t];

      ctx.beginPath();

      ctx.arc(p.x, p.y, 12, Math.PI * 2, false);
      ctx.fillStyle = p.color;
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;

      //To delete the balls once they've moved out of the canvas
      if (p.x < -50 || p.y < -50 || p.x > W + 50 || p.y > H + 50) particles.splice(t, 1)
    }
  }

  //Lets create a function which will help us to create multiple particles
  function create_particle (canvas, radius) {
    var W = canvas.width
    var H = canvas.height
    //Random position on the canvas
    this.x = W / 2;
    this.y = H / 2;

    //Lets add random velocity to each particle
    this.vx = Math.random() * 40 - 20;
    this.vy = Math.random() * 40 - 20;
    this.color = colors[radius];

    //Random size
    this.radius = radius;
  }

  function flash_screen (canvas) {
    flashElem.className = "white"
    setTimeout(function () {
      flashElem.className = ""
    }, 10)
  }
