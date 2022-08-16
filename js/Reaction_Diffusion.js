
var canvas = document.getElementById("webgl-canvas");
var gl = canvas.getContext("webgl2");
if (!gl) console.log("Not ennable to run WebGL2 with this browser");

window.onresize = function() {
    app.resize(window.innerWidth, window.innerHeight);
}

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

var app = PicoGL.createApp(canvas).clearColor(0.0, 0.0, 0.0, 1.0);


// Setting the grid that will be used as a texture to render the reaction

function dot(cx, cy, r = 3) {
    const r2 = r ** 2;
    for (let y = cy - r; y < cy + r; ++y) {
        for (let x = cx - r; x < cx + r; ++x) {
            if ((x - cx) ** 2 + (y - cy) ** 2 < r2) {
                const i = canvas.width * y + x << 2;
                initialGridState[i + 1] = 255;
            }
        }
    }
}

const initialGridState = new Uint8Array(canvas.width * canvas.height * 4);
for (let i = 0; i < canvas.width * canvas.height; ++i) {
    initialGridState[i * 4] = 255;
}

for (let i = 0; i < 20; ++i) {
    dot(canvas.width * Math.random(), canvas.height * Math.random());
}



const updateVert = `
#version 300 es
precision mediump float;
in vec2 position;

void main() {
    gl_Position = vec4(position, 0, 1);
}`

const updateFrag = `
#version 300 es
precision mediump float;

uniform sampler2D currState;
uniform vec2 u_size;

uniform vec2 mouse;
layout(std140) uniform UpdateUniforms {
    vec2 mouse2;
    float radius;
    float u_F;
    float u_K;
    float D_a;
    float D_b;
    int click;
    int run;
    int clear;
};

const float D_t = 1.0;

out vec4 fragColor;
void main() {
    vec2 position = gl_FragCoord.xy;
    vec3 color = texture(currState, position / u_size).xyz;
    vec2 laplacian = 
        - 1.0  * color.xy

        + 0.2  * texture(currState, (position + vec2(0.0, 1.0)) / u_size).xy
        + 0.2  * texture(currState, (position + vec2(1.0, 0.0)) / u_size).xy
        + 0.2  * texture(currState, (position + vec2(0.0, -1.0)) / u_size).xy
        + 0.2  * texture(currState, (position + vec2(-1.0, 0.0)) / u_size).xy

        + 0.05 * texture(currState, (position + vec2(-1.0, -1.0)) / u_size).xy
        + 0.05 * texture(currState, (position + vec2(-1.0,  1.0)) / u_size).xy
        + 0.05 * texture(currState, (position + vec2( 1.0, -1.0)) / u_size).xy
        + 0.05 * texture(currState, (position + vec2( 1.0,  1.0)) / u_size).xy
        ;

    float A = color.x + D_t * (D_a * laplacian.x - color.x * color.y * color.y + u_F * (1.0 - color.x));
    float B = color.y + D_t * (D_b * laplacian.y + color.x * color.y * color.y - (u_K + u_F) * color.y);

    if (run == 1) {
        fragColor = vec4(
            color.x + D_t * (D_a * laplacian.x - color.x * color.y * color.y + u_F * (1.0 - color.x)),
            color.y + D_t * (D_b * laplacian.y + color.x * color.y * color.y - (u_K + u_F) * color.y),
            0.0,
            1.0
        );
    } 
    else {
        fragColor = vec4(color.x, color.y, 0.0, 1.0);
    }

    if ( click == 1 ) {
        if ( sqrt( pow(position.x - mouse.x, 2.0) + pow(position.y - mouse.y, 2.0)) < radius) {
            fragColor.y = 0.5;
        }
    }

    if (clear == 1) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
}`

const drawVert = `
#version 300 es

in vec2 position;
in vec2 texcoord;

out vec2 v_texcoord;
void main () {
    gl_Position = vec4(position, 0, 1);
    v_texcoord = texcoord;
}`

const drawFrag = `
#version 300 es

precision mediump float;
uniform sampler2D nextGridState;

in vec2 v_texcoord;
out vec4 fragColor;
void main() {
    float A = texture(nextGridState, v_texcoord).x;
    float B = texture(nextGridState, v_texcoord).y;

    fragColor = vec4(A-B, A-B, A-B, 1.0);
}`



var quadPositions = app.createVertexBuffer(PicoGL.FLOAT, 2, new Float32Array([
    -1.0,  1.0,
     1.0,  1.0, 
    -1.0, -1.0, 
    -1.0, -1.0,
     1.0,  1.0,
     1.0, -1.0
]));
var texcoord = app.createVertexBuffer(PicoGL.FLOAT, 2, new Float32Array([
    0.0,  0.0,
    1.0,  0.0,
    0.0,  1.0,
    0.0,  1.0,
    1.0,  0.0,
    1.0,  1.0
]));
var vertexArray = app.createVertexArray();
vertexArray.vertexAttributeBuffer(0, quadPositions);
vertexArray.vertexAttributeBuffer(1, texcoord);



var currGridState_tex = app.createTexture2D(initialGridState, canvas.width, canvas.height);
var currGridState = app.createFramebuffer();
currGridState.colorTarget(0, currGridState_tex);

var nextGridState_tex = app.createTexture2D(initialGridState, canvas.width, canvas.height);
var nextGridState = app.createFramebuffer();
nextGridState.colorTarget(0, nextGridState_tex);

var FK = [[0.055, 0.062], [0.0367, 0.0649], [0.0545, 0.062]];
var FK_options = ['Standard', 'Mitosis', 'Coral Growth'];

let settings = {
    feed: 0.055,
    kill: 0.062,
    D_a: 1.0,
    D_b: 0.25,
    FK_index: 0,
    radius: 3.5
}

webglLessonsUI.setupUI(document.querySelector('#ui'), settings, [
    {type: 'slider', key: 'feed', name: 'Feed', min: 0.0, max: 0.1, step: 0.001, precision: 3, slide: (event, ui) => {
        settings.feed = ui.value;
    }},
    {type: 'slider', key: 'kill', name: 'Kill', min: 0.0, max: 0.1, step: 0.001, precision: 3, slide: (event, ui) => {
        settings.kill = ui.value;
    }},
    {type: 'slider', key: 'D_a', name: 'Diffusion Rate A', min: 0.0, max: 1.0, step: 0.001, precision: 3, slide: (event, ui) => {
        settings.D_a = ui.value;
    }},
    {type: 'slider', key: 'D_b', name: 'Diffusion Rate B', min: 0.0, max: 1.0, step: 0.01, precision: 2, slide: (event, ui) => {
        settings.D_b = ui.value;
    }},
    {type: 'slider', key: 'radius', name: 'Radius', min: 0.0, max: 20.0, step: 0.01, precision: 2, slide: (event, ui) => {
        settings.radius = ui.value;
    }},
    {type: 'option', key: 'FK_index', name: 'Patterns', options: FK_options, change: (event, ui) => {
        settings.feed = FK[settings.FK_index][0];
        settings.kill = FK[settings.FK_index][1];
    }}
]);

var clicked = 0;
var run = 1;
var clear = 0;
var mouse = new Uint16Array(2);

var updateUniforms = app.createUniformBuffer([
    PicoGL.INT_VEC2,
    PicoGL.FLOAT,
    PicoGL.FLOAT,
    PicoGL.FLOAT,
    PicoGL.FLOAT,
    PicoGL.FLOAT,
    PicoGL.INT,
    PicoGL.INT,
    PicoGL.INT,
]);

function updateBlock() {
    updateUniforms.set(0, mouse);
    updateUniforms.set(1, settings.radius);
    updateUniforms.set(2, settings.feed);
    updateUniforms.set(3, settings.kill);
    updateUniforms.set(4, settings.D_a);
    updateUniforms.set(5, settings.D_b);
    updateUniforms.set(6, clicked);
    updateUniforms.set(7, run);
    updateUniforms.set(8, clear);
    updateUniforms.update();
}
updateBlock();



app.createPrograms([updateVert, updateFrag], [drawVert, drawFrag]).then(([updateProgram, drawProgram]) => {

    var drawCall_update = app.createDrawCall(updateProgram, vertexArray);
    drawCall_update.texture("currState", currGridState.colorAttachments[0]);
    drawCall_update.uniformBlock("UpdateUniforms", updateUniforms);
    drawCall_update.uniform('u_size', [canvas.width, canvas.height]);
    drawCall_update.uniform('mouse', mouse);

    var drawCall = app.createDrawCall(drawProgram, vertexArray);
    drawCall.texture("nextGridState", nextGridState.colorAttachments[0]);
    
    function drawFrame() {

        updateBlock();

        drawCall_update.uniform('mouse', mouse);
        
        app.drawFramebuffer(nextGridState);
        drawCall_update.draw();

        app.readFramebuffer(nextGridState)
        .drawFramebuffer(currGridState)
        .blitFramebuffer(PicoGL.COLOR_BUFFER_BIT);

        app.defaultDrawFramebuffer();
        drawCall.draw();

        window.requestAnimationFrame(drawFrame);
    }
    window.requestAnimationFrame(drawFrame);
});



// EVENTS:

document.addEventListener('mousedown', (event) => {
    mouse[0] = event.layerX;
    mouse[1] = event.layerY;

    if (event.clientX > window.innerWidth - 250 && event.clientY < 250)
        clicked = 0;
    else 
        clicked = 1;
})

document.addEventListener('mouseup', (event) => {
    clicked = 0;
})

document.addEventListener('mousemove', (event) => {
    mouse[0] = event.layerX;
    mouse[1] = event.layerY;
})

document.addEventListener('keydown', (event) => {
    switch (event.code) {
        case 'Space':
            if (run == 0) 
                run = 1;
            else 
                run = 0;
            break;

        case 'KeyC':
            clear = 1;
            break;
    }
})

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyC':
            clear = 0;
            break;
    }
})