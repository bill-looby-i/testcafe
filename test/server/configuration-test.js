/*eslint-disable no-console */

const { cloneDeep } = require('lodash');
const { expect }    = require('chai');
const fs            = require('fs');
const tmp           = require('tmp');
const nanoid        = require('nanoid');

const TestCafeConfiguration                   = require('../../lib/configuration/testcafe-configuration');
const TypeScriptConfiguration                 = require('../../lib/configuration/typescript-configuration');
const { DEFAULT_TYPESCRIPT_COMPILER_OPTIONS } = require('../../lib/configuration/default-values');
const consoleWrapper                          = require('./helpers/console-wrapper');

const tsConfigPath           = 'tsconfig.json';
const customTSConfigFilePath = 'custom-config.json';

const createConfigFile = (path, options) => {
    options = options || {};
    fs.writeFileSync(path, JSON.stringify(options));
};

const createTestCafeConfigurationFile   = createConfigFile.bind(null, TestCafeConfiguration.FILENAME);
const createTypeScriptConfigurationFile = createConfigFile.bind(null, tsConfigPath);

describe('TestCafeConfiguration', () => {
    const testCafeConfiguration = new TestCafeConfiguration();
    let keyFileContent          = null;

    consoleWrapper.init();
    tmp.setGracefulCleanup();

    beforeEach(() => {
        const keyFile = tmp.fileSync();

        keyFileContent = Buffer.from(nanoid());
        fs.writeFileSync(keyFile.name, keyFileContent);

        createTestCafeConfigurationFile({
            'hostname': '123.456.789',
            'port1':    1234,
            'port2':    5678,
            'src':      'path1/folder',
            'ssl':      {
                'key':                keyFile.name,
                'rejectUnauthorized': 'true'
            },
            'browsers':    'ie',
            'concurrency': 0.5,
            'filter':      {
                'fixture':     'testFixture',
                'test':        'some test',
                'testGrep':    'test\\d',
                'fixtureGrep': 'fixture\\d',
                'testMeta':    { test: 'meta' },
                'fixtureMeta': { fixture: 'meta' }
            },
            'clientScripts':          'test-client-script.js',
            'screenshotPath':         'screenshot-path',
            'screenshotPathPattern':  'screenshot-path-pattern',
            'takeScreenshotsOnFails': true,
            'screenshotsFullPage':    true
        });
    });

    afterEach(() => {
        if (fs.existsSync(testCafeConfiguration.filePath))
            fs.unlinkSync(testCafeConfiguration.filePath);

        consoleWrapper.unwrap();
        consoleWrapper.messages.clear();
    });

    describe('Init', () => {
        describe('Exists', () => {
            it('Config is not well-formed', () => {
                fs.writeFileSync(testCafeConfiguration.filePath, '{');
                consoleWrapper.wrap();

                return testCafeConfiguration.init()
                    .then(() => {
                        consoleWrapper.unwrap();

                        expect(testCafeConfiguration.getOption('hostname')).eql(void 0);
                        expect(consoleWrapper.messages.log).contains(`Failed to parse the '${testCafeConfiguration.filePath}' file.`);
                    });
            });

            it('Options', () => {
                return testCafeConfiguration.init()
                    .then(() => {
                        expect(testCafeConfiguration.getOption('hostname')).eql('123.456.789');
                        expect(testCafeConfiguration.getOption('port1')).eql(1234);

                        const ssl = testCafeConfiguration.getOption('ssl');

                        expect(ssl.key).eql(keyFileContent);
                        expect(ssl.rejectUnauthorized).eql(true);
                        expect(testCafeConfiguration.getOption('src')).eql([ 'path1/folder' ]);
                        expect(testCafeConfiguration.getOption('browsers')).eql([ 'ie' ]);
                        expect(testCafeConfiguration.getOption('concurrency')).eql(0.5);
                        expect(testCafeConfiguration.getOption('filter')).to.be.a('function');
                        expect(testCafeConfiguration.getOption('filter').testGrep.test('test1')).to.be.true;
                        expect(testCafeConfiguration.getOption('filter').fixtureGrep.test('fixture1')).to.be.true;
                        expect(testCafeConfiguration.getOption('filter').testMeta).to.be.deep.equal({ test: 'meta' });
                        expect(testCafeConfiguration.getOption('filter').fixtureMeta).to.be.deep.equal({ fixture: 'meta' });
                        expect(testCafeConfiguration.getOption('clientScripts')).eql([ 'test-client-script.js' ]);
                        expect(testCafeConfiguration.getOption('screenshotPath')).eql('screenshot-path');
                        expect(testCafeConfiguration.getOption('screenshotPathPattern')).eql('screenshot-path-pattern');
                        expect(testCafeConfiguration.getOption('takeScreenshotsOnFails')).eql(true);
                        expect(testCafeConfiguration.getOption('screenshotsFullPage')).eql(true);
                    });
            });

            it('"Reporter" option', () => {
                let optionValue = null;

                createTestCafeConfigurationFile({
                    reporter: 'json'
                });

                return testCafeConfiguration
                    .init()
                    .then(() => {
                        optionValue = testCafeConfiguration.getOption('reporter');

                        expect(optionValue.length).eql(1);
                        expect(optionValue[0].name).eql('json');

                        createTestCafeConfigurationFile({
                            reporter: ['json', 'minimal']
                        });

                        return testCafeConfiguration.init();
                    })
                    .then(() => {
                        optionValue = testCafeConfiguration.getOption('reporter');

                        expect(optionValue.length).eql(2);
                        expect(optionValue[0].name).eql('json');
                        expect(optionValue[1].name).eql('minimal');

                        createTestCafeConfigurationFile({
                            reporter: [ {
                                name: 'json',
                                file: 'path/to/file'
                            }]
                        });

                        return testCafeConfiguration.init();
                    })
                    .then(() => {
                        optionValue = testCafeConfiguration.getOption('reporter');

                        expect(optionValue.length).eql(1);
                        expect(optionValue[0].name).eql('json');
                        expect(optionValue[0].file).eql('path/to/file');
                    });
            });
        });

        it('File doesn\'t exists', () => {
            fs.unlinkSync(testCafeConfiguration.filePath);

            const defaultOptions = cloneDeep(testCafeConfiguration._options);

            return testCafeConfiguration.init()
                .then(() => {
                    expect(testCafeConfiguration._options).to.deep.equal(defaultOptions);
                });
        });
    });

    describe('Merge options', () => {
        it('One', () => {
            consoleWrapper.wrap();

            return testCafeConfiguration.init()
                .then(() => {
                    testCafeConfiguration.mergeOptions({ 'hostname': 'anotherHostname' });
                    testCafeConfiguration.notifyAboutOverriddenOptions();

                    consoleWrapper.unwrap();

                    expect(testCafeConfiguration.getOption('hostname')).eql('anotherHostname');
                    expect(consoleWrapper.messages.log).eql('The "hostname" option from the configuration file will be ignored.');
                });
        });

        it('Many', () => {
            consoleWrapper.wrap();

            return testCafeConfiguration.init()
                .then(() => {
                    testCafeConfiguration.mergeOptions({
                        'hostname': 'anotherHostname',
                        'port1':    'anotherPort1',
                        'port2':    'anotherPort2'
                    });

                    testCafeConfiguration.notifyAboutOverriddenOptions();

                    consoleWrapper.unwrap();

                    expect(testCafeConfiguration.getOption('hostname')).eql('anotherHostname');
                    expect(testCafeConfiguration.getOption('port1')).eql('anotherPort1');
                    expect(testCafeConfiguration.getOption('port2')).eql('anotherPort2');
                    expect(consoleWrapper.messages.log).eql('The "hostname", "port1", "port2" options from the configuration file will be ignored.');
                });
        });

        it('Should ignore an option with the "undefined" value', () => {
            return testCafeConfiguration.init()
                .then(() => {
                    testCafeConfiguration.mergeOptions({ 'hostname': void 0 });

                    expect(testCafeConfiguration.getOption('hostname')).eql('123.456.789');
                });
        });
    });
});

describe('TypeScriptConfiguration', () => {
    const typeScriptConfiguration = new TypeScriptConfiguration(tsConfigPath);

    it('Default', () => {
        const defaultTypeScriptConfiguration = new TypeScriptConfiguration();

        return defaultTypeScriptConfiguration.init()
            .then(() => {
                expect(defaultTypeScriptConfiguration.getOptions()).to.deep.equal(DEFAULT_TYPESCRIPT_COMPILER_OPTIONS);
            });
    });

    it('Configuration file does not exist', async () => {
        let message = null;

        const nonExistingConfiguration = new TypeScriptConfiguration('non-existing-path');

        try {
            await nonExistingConfiguration.init();
        }
        catch (err) {
            message = err.message;
        }

        expect(message).eql(`Unable to find the TypeScript configuration file in "${nonExistingConfiguration.filePath}"`);
    });

    it('Config is not well-formed', () => {
        fs.writeFileSync(tsConfigPath, '{');
        consoleWrapper.wrap();

        return typeScriptConfiguration.init()
            .then(() => {
                consoleWrapper.unwrap();

                expect(typeScriptConfiguration.getOption('hostname')).eql(void 0);
                expect(consoleWrapper.messages.log).contains(`Failed to parse the '${typeScriptConfiguration.filePath}' file.`);
            });
    });

    describe('With configuration file', () => {
        tmp.setGracefulCleanup();

        beforeEach(() => {
            consoleWrapper.init();
            consoleWrapper.wrap();
        });

        afterEach(() => {
            if (typeScriptConfiguration.filePath)
                fs.unlinkSync(typeScriptConfiguration.filePath);

            consoleWrapper.unwrap();
            consoleWrapper.messages.clear();
        });

        it('tsconfig.json does not apply automatically', () => {
            const defaultTSConfiguration = new TypeScriptConfiguration();

            createTypeScriptConfigurationFile({
                compilerOptions: {
                    experimentalDecorators: false,
                }
            });

            return defaultTSConfiguration.init()
                .then(() => {
                    consoleWrapper.unwrap();

                    const options = defaultTSConfiguration.getOptions();

                    expect(options['experimentalDecorators']).eql(true);
                });
        });

        it('override options', () => {
            // NOTE: suppressOutputPathCheck can't be overridden by a config file
            createTypeScriptConfigurationFile({
                compilerOptions: {
                    experimentalDecorators: false,
                    emitDecoratorMetadata:  false,
                    allowJs:                false,
                    pretty:                 false,
                    inlineSourceMap:        false,
                    noImplicitAny:          true,

                    module:           'esnext',
                    moduleResolution: 'classic',
                    target:           'esnext',
                    lib:              ['es2018', 'dom'],

                    incremental:         true,
                    tsBuildInfoFile:     'tsBuildInfo.txt',
                    emitDeclarationOnly: true,
                    declarationMap:      true,
                    declarationDir:      'C:/',
                    composite:           true,
                    outFile:             'oufile.js',
                    out:                 ''
                }
            });

            return typeScriptConfiguration.init()
                .then(() => {
                    consoleWrapper.unwrap();

                    const options = typeScriptConfiguration.getOptions();

                    expect(options['experimentalDecorators']).eql(false);
                    expect(options['emitDecoratorMetadata']).eql(false);
                    expect(options['allowJs']).eql(false);
                    expect(options['pretty']).eql(false);
                    expect(options['inlineSourceMap']).eql(false);
                    expect(options['noImplicitAny']).eql(true);
                    expect(options['suppressOutputPathCheck']).eql(true);

                    // NOTE: `module` and `target` default options can not be overridden by custom config
                    expect(options['module']).eql(1);
                    expect(options['moduleResolution']).eql(2);
                    expect(options['target']).eql(3);

                    expect(options['lib']).deep.eql(['lib.es2018.d.ts', 'lib.dom.d.ts']);

                    expect(options).not.have.property('incremental');
                    expect(options).not.have.property('tsBuildInfoFile');
                    expect(options).not.have.property('emitDeclarationOnly');
                    expect(options).not.have.property('declarationMap');
                    expect(options).not.have.property('declarationDir');
                    expect(options).not.have.property('composite');
                    expect(options).not.have.property('outFile');
                    expect(options).not.have.property('out');

                    expect(consoleWrapper.messages.log).contains('You cannot override the "module" compiler option in the TypeScript configuration file.');
                    expect(consoleWrapper.messages.log).contains('You cannot override the "moduleResolution" compiler option in the TypeScript configuration file.');
                    expect(consoleWrapper.messages.log).contains('You cannot override the "target" compiler option in the TypeScript configuration file.');
                });
        });

        it('Should not display override messages if config values are the same as default values', () => {
            const tsConfiguration = new TypeScriptConfiguration(tsConfigPath);

            createTypeScriptConfigurationFile({
                compilerOptions: {
                    module:           'commonjs',
                    moduleResolution: 'node',
                    target:           'es2016'
                }
            });

            return tsConfiguration.init()
                .then(() => {
                    consoleWrapper.unwrap();

                    expect(consoleWrapper.messages.log).not.ok;
                });
        });

        it('TestCafe config + TypeScript config', () => {
            let runner = null;

            createTestCafeConfigurationFile({
                tsConfigPath: customTSConfigFilePath
            });

            createConfigFile(customTSConfigFilePath, {
                compilerOptions: {
                    target: 'es5'
                }
            });

            const configuration = new TestCafeConfiguration();

            return configuration.init()
                .then(() => {
                    const RunnerCtor = require('../../lib/runner');

                    runner = new RunnerCtor(null, null, configuration);

                    runner.src('test/server/data/test-suites/typescript-basic/testfile1.ts');
                    runner._setBootstrapperOptions();

                    return runner.bootstrapper._getTests();
                })
                .then(() => {
                    fs.unlinkSync(TestCafeConfiguration.FILENAME);
                    typeScriptConfiguration._filePath = customTSConfigFilePath;

                    expect(runner.bootstrapper.tsConfigPath).eql(customTSConfigFilePath);
                    expect(consoleWrapper.messages.log).contains('You cannot override the "target" compiler option in the TypeScript configuration file.');
                });
        });

        it('Runner + TypeScript config', () => {
            let runner = null;

            createConfigFile(customTSConfigFilePath, {
                compilerOptions: {
                    target: 'es5'
                }
            });

            const RunnerCtor = require('../../lib/runner');

            runner = new RunnerCtor(null, null, new TestCafeConfiguration());

            runner.src('test/server/data/test-suites/typescript-basic/testfile1.ts');
            runner.tsConfigPath(customTSConfigFilePath);
            runner._setBootstrapperOptions();

            return runner.bootstrapper._getTests()
                .then(() => {
                    typeScriptConfiguration._filePath = customTSConfigFilePath;

                    expect(runner.bootstrapper.tsConfigPath).eql(customTSConfigFilePath);
                    expect(consoleWrapper.messages.log).contains('You cannot override the "target" compiler option in the TypeScript configuration file.');
                });
        });
    });
});
