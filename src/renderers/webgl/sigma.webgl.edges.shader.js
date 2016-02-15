;(function() {
  'use strict';

  sigma.utils.pkg('sigma.webgl.edges');

  /**
   * This edge renderer will display edges as polylines using a vertex shader.
   * This should be faster than rendering lines as triangles and supports
   * thickness better than gl.LINES.
   *
   * This should also pave the way towards easy and efficient curved edges
   * rendering later.
   */
  sigma.webgl.edges.shader = {
    POINTS: 4,
    ATTRIBUTES: 6,
    addEdge: function(edge, source, target, data, i, prefix, settings) {
      var thickness = (edge[prefix + 'size'] || 1),
          x1 = source[prefix + 'x'],
          y1 = source[prefix + 'y'],
          x2 = target[prefix + 'x'],
          y2 = target[prefix + 'y'],
          color = edge.color;

      if (!color)
        switch (settings('edgeColor')) {
          case 'source':
            color = source.color || settings('defaultNodeColor');
            break;
          case 'target':
            color = target.color || settings('defaultNodeColor');
            break;
          default:
            color = settings('defaultEdgeColor');
            break;
        }

      // Normalize color:
      color = sigma.utils.floatColor(color);

      // Computing normals:
      var dx = x2 - x1,
          dy = y2 - y1,
          len = dx * dx + dy * dy,
          normals;

      if (!len) {
        normals = [0, 0];
      }
      else {
        len = 1 / Math.sqrt(len);

        var normals = [
          dx * len,
          dy * len
        ];
      }

      // First point
      data[i++] = x1;
      data[i++] = y1;
      data[i++] = normals[0];
      data[i++] = normals[1];
      data[i++] = thickness;
      data[i++] = color;

      // First point flipped
      data[i++] = x1;
      data[i++] = y1;
      data[i++] = 1 - normals[1];
      data[i++] = normals[0];
      data[i++] = thickness;
      data[i++] = color;

      // Second point
      data[i++] = x2;
      data[i++] = y2;
      data[i++] = normals[0];
      data[i++] = normals[1];
      data[i++] = thickness;
      data[i++] = color;

      // Second point flipped
      data[i++] = x2;
      data[i++] = y2;
      data[i++] = normals[1];
      data[i++] = 1 - normals[0];
      data[i++] = thickness;
      data[i++] = color;
    },
    render: function(gl, program, data, params) {
      var buffer;

      // Define attributes:
      var positionLocation =
            gl.getAttribLocation(program, 'a_position'),
          normalLocation =
            gl.getAttribLocation(program, 'a_normal'),
          thicknessLocation =
            gl.getAttribLocation(program, 'a_thickness'),
          colorLocation =
            gl.getAttribLocation(program, 'a_color'),
          resolutionLocation =
            gl.getUniformLocation(program, 'u_resolution'),
          ratioLocation =
            gl.getUniformLocation(program, 'u_ratio'),
          matrixLocation =
            gl.getUniformLocation(program, 'u_matrix');

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

      gl.uniform2f(resolutionLocation, params.width, params.height);
      gl.uniform1f(
        ratioLocation,
        params.ratio / Math.pow(params.ratio, params.settings('edgesPowRatio'))
      );

      gl.uniformMatrix3fv(matrixLocation, false, params.matrix);

      gl.enableVertexAttribArray(positionLocation);
      gl.enableVertexAttribArray(normalLocation);
      gl.enableVertexAttribArray(thicknessLocation);
      gl.enableVertexAttribArray(colorLocation);

      gl.vertexAttribPointer(positionLocation,
        2,
        gl.FLOAT,
        false,
        this.ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT,
        0
      );
      gl.vertexAttribPointer(normalLocation,
        2,
        gl.FLOAT,
        false,
        this.ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT,
        8
      );
      gl.vertexAttribPointer(thicknessLocation,
        1,
        gl.FLOAT,
        false,
        this.ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT,
        16
      );
      gl.vertexAttribPointer(colorLocation,
        1,
        gl.FLOAT,
        false,
        this.ATTRIBUTES * Float32Array.BYTES_PER_ELEMENT,
        20
      );

      gl.drawArrays(
        gl.POINTS,
        params.start || 0,
        params.count || (data.length / this.ATTRIBUTES)
      );
    },
    initProgram: function(gl) {
      var vertexShader,
          fragmentShader,
          program;

      vertexShader = sigma.utils.loadShader(
        gl,
        [
          'attribute vec2 a_position;',
          'attribute vec2 a_normal;',
          'attribute float a_thickness;',
          'attribute float a_color;',

          'uniform vec2 u_resolution;',
          'uniform float u_ratio;',
          'uniform mat3 u_matrix;',

          'varying vec4 v_color;',

          'void main() {',

            // Position
            // Scale from [[-1 1] [-1 1]] to the container:
            'vec2 yeah = a_normal;',
            'float dummy = u_ratio * a_thickness;',

            'vec2 delta = vec2(a_normal * a_thickness);',
            'vec2 position = (u_matrix * vec3(a_position + delta, 1)).xy;',
            'position = (position / u_resolution * 2.0 - 1.0) * vec2(1, -1);',


    //            vec4 delta = vec4(a_normal * u_linewidth, 0, 0);
    // vec4 pos = u_mv_matrix * vec4(a_pos, 0, 1);
    // gl_Position = u_p_matrix * (pos + delta);

            // Applying
            'gl_Position = vec4(position, 0, 1);',
            'gl_PointSize = 5.0;',

            // Extract the color:
            'float c = a_color;',
            'v_color.b = mod(c, 256.0); c = floor(c / 256.0);',
            'v_color.g = mod(c, 256.0); c = floor(c / 256.0);',
            'v_color.r = mod(c, 256.0); c = floor(c / 256.0); v_color /= 255.0;',
            'v_color.a = 1.0;',
          '}'
        ].join('\n'),
        gl.VERTEX_SHADER
      );

      fragmentShader = sigma.utils.loadShader(
        gl,
        [
          'precision mediump float;',

          'varying vec4 v_color;',

          'void main(void) {',
            'gl_FragColor = v_color;',
          '}'
        ].join('\n'),
        gl.FRAGMENT_SHADER
      );

      program = sigma.utils.loadProgram(gl, [vertexShader, fragmentShader]);

      return program;
    }
  };
})();
