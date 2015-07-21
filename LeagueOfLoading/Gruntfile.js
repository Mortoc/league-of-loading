/// <binding BeforeBuild='debugbuild' Clean='clean' />
/*jslint node: true */
'use strict';

var _ = require('underscore');

var files = {
    lib: [
      "bower_components/underscore/underscore.js",
      "bower_components/jquery/dist/jquery.js",
      "bower_components/moment/moment.js",
      "bower_components/numeraljs/numeral.js",
      "bower_components/numeraljs/languages.js",
      "bower_components/d3/d3.js",
      "bower_components/angular/angular.js",
      "bower_components/angular-animate/angular-animate.js",
      "bower_components/angular-resource/angular-resource.js",
      "bower_components/angular-ui-router/release/angular-ui-router.js",
      "bower_components/angular-sanitize/angular-sanitize.js",
      "bower_components/angular-translate/angular-translate.js"
    ],
    lib_test: [
      'bower_components/angular-mocks/angular-mocks.js'
    ],
    scripts: [
      'app/**/*.js',
      '!app/**/*-spec.js'
    ],
    templates: [
      'app/**/*.html',
      'app/**/*.svg',
    ],
    test: [
      'app/**/*-spec.js',
    ],
    extra_stylesheets: [
    ]
};

module.exports = function (grunt) {
    // load all grunt tasks
    require('load-grunt-tasks')(grunt);

    // Project configuration
    grunt.initConfig({
        files: files,

        clean: {
            before: {
                src: ['frontend_build_temp', 'www']
            },
            after: {
                src: ['frontend_build_temp']
            }
        },

        less: {
            deploy: {
                options: {
                    paths: [
                      'app',
                    ],
                    compress: true,
                    ieCompat: false,
                    rootPath: '/app/'
                },
                files: {
                    'frontend_build_temp/app.min.css': 'app/app.less',
                }
            },
            update_dev: {
                options: {
                    paths: [
                      'app',
                    ],
                    compress: false,
                    rootPath: '/app/'
                },
                files: {
                    'www/app.css': 'app/app.less',
                }
            }
        },

        ngtemplates: {
            main: {
                options: {
                    //htmlmin:'<%= htmlmin.main.options %>',
                    standalone: true,
                    module: "compiledTemplates",
                },
                src: [files.templates],
                dest: 'frontend_build_temp/app.templates.js'
            },
            update_dev: {
                options: {
                    standalone: true,
                    module: "compiledTemplates",
                },
                src: [files.templates],
                dest: 'www/templates.js'
            }
        },

        copy: {
            update_dev: {
                files: [
                  {
                      // copy bower_components and src
                      expand: true,
                      src: [
                        'bower_components/**',
                        'app/**'
                      ],
                      dest: 'www/'
                  },
                ]
            }
        },

        dom_munger: {
            deploy: {
                options: {
                    append: [
                      { selector: 'body', html: '<script src="app.js"></script>' },
                      { selector: 'head', html: '<link rel="stylesheet" href="app.css">' },
                    ]
                },
                src: 'app/index.html',
                dest: 'frontend_build_temp/index.munged.html'
            },

            update_dev: {
                src: 'app/index.html',
                dest: 'www/index.html',

                options: {
                    // Write all the scripts to the index
                    callback: function ($) {
                        var addScript = function (file) {
                            $('body').append('\t<script type="text/javascript" src="' + file + '"></script>\n');
                        };
                        var addStylesheet = function (file) {
                            $('head').append('\t<link type="text/css" rel="stylesheet" href="' + file + '"></link>\n');
                        };

                        // Add Scripts
                        addScript("cordova.js");
                        grunt.file.expand({ filter: 'isFile' }, files.lib).forEach(addScript);
                        addScript("templates.js");
                        grunt.file.expand({ filter: 'isFile' }, files.scripts).forEach(addScript);

                        // Add Stylesheets
                        grunt.file.expand({ filter: 'isFile' }, files.extra_stylesheets).forEach(addStylesheet);
                        addStylesheet('app.css');
                    }
                }
            }
        },

        concat: {
            options: {
                separator: ';',
            },
            dist: {
                src: [
                  files.lib,
                  files.scripts,
                  '<%= ngtemplates.main.dest %>'
                ],
                dest: 'frontend_build_temp/app.full.js',
            },
            dist_css: {
                src: [
                  "<%= files.extra_stylesheets %>",
                  "frontend_build_temp/app.min.css"
                ],
                dest: 'www/app.css'
            }
        },

        ngAnnotate: {
            main: {
                src: 'frontend_build_temp/app.full.js',
                dest: 'frontend_build_temp/app.full.annotated.js'
            }
        },

        uglify: {
            options: {
                screwIE8: true,
                compress: {
                    drop_debugger: true,
                    drop_console: true,
                    sequences: true,
                    dead_code: true,
                    conditionals: true,
                    comparisons: true,
                    booleans: true,
                    loops: true,
                    join_vars: true,
                    unsafe: true
                }
            },
            main: {
                src: 'frontend_build_temp/app.full.annotated.js',
                dest: 'www/app.js'
            }
        },

        htmlmin: {
            main: {
                options: {
                    collapseBooleanAttributes: true,
                    collapseWhitespace: true,
                    removeAttributeQuotes: true,
                    removeComments: true,
                    removeEmptyAttributes: true,
                    removeScriptTypeAttributes: true,
                    removeStyleLinkTypeAttributes: true
                },
                files: {
                    'www/index.html': 'frontend_build_temp/index.munged.html'
                }
            }
        },

        karma: {
            options: {
                frameworks: ['jasmine'],
                files: [
                  '<%= files.lib %>',
                  '<%= files.lib_test %>',
                  '<%= files.scripts %>',
                  '<%= files.templates %>',
                  '<%= files.test %>',
                ],
                logLevel: 'ERROR',
                reporters: ['mocha'],
                autoWatch: false, //watching is handled by grunt-contrib-watch
                singleRun: true,
                port: 9876,
                preprocessors: {
                    '**/*.html': ['ng-html2js'],
                    '**/*.svg': ['ng-html2js']
                },

                ngHtml2JsPreprocessor: {
                    moduleName: 'compiledTemplates'
                }
            },

            all_tests: {
                browsers: ['PhantomJS', 'Chrome', 'Firefox']
            },

            debug: {
                browsers: ['Chrome'],
                autoWatch: true,
                singleRun: false
            }
        }
    });

    var fullBuild = [
      'clean:before',
      'less',
      'ngtemplates:main',
      'concat',
      'ngAnnotate',
      'uglify',
      'dom_munger:deploy',
      'htmlmin',
      'clean:after'
    ];

    grunt.registerTask('build', fullBuild);
    grunt.registerTask('default', fullBuild);

    grunt.registerTask('debugbuild', [
      'clean:before',
      'copy:update_dev',
      'less:update_dev',
      'dom_munger:update_dev',
      'ngtemplates:update_dev',
    ]);

    grunt.registerTask('test', [
      'karma:all_tests'
    ]);

    grunt.registerTask('test:debug', [
      'karma:debug'
    ]);
};