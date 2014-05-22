module.exports = function(grunt) {

	grunt.initConfig({

		watch:{
			all:{
				files:['./js/*', './index.html', 'Gruntfile.js'],
				tasks:['default'],
				options:{
					livereload:true
				}
			}
		},

		connect: {
			server: {
				options: {
					port: 3000,
					base: '.',
					keepalive:true

				}
			}
		}

        })

	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-connect');

}
