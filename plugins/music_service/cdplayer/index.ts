declare var __dirname : string;

import libQ = require('kew');
import fs = require('fs-extra');
import conf = require('v-conf');
import udev = require("udev");
import nodetools = require('nodetools');
import libMpd = require('mpd');
import {CDController, IDisc, ITrack, IDrives, ICDState} from './lib/CDController';

class ControllerCdio {
    context: any;
    commandRouter: any;
    logger: any;
    configManager: any;
    config: any;  
    cdController: any; 
    mpdPlugin: any;

    constructor(context: any) {
        this.context = context;
        this.commandRouter = this.context.coreCommand;
        this.logger = this.context.logger;
        this.configManager = this.context.configManager;
        
    }

    // define behaviour on system start up. In our case just read config file
    public onVolumioStart() {
        let defer = libQ.defer();
        
        let configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
        this.config = new conf();
        this.config.loadFile(configFile);
        defer.resolve();
        return defer.promise;
    }

    // Volumio needs this
    public getConfigurationFiles() : string[] {
        return ['config.json'];
    }

    public onStart() {
        let self = this;
        let defer=libQ.defer();
        
        self.addToBrowseSources();
        self.cdController = new CDController(self.context);
        self.cdController.onEjected.subscribe(function(drive){
            self.commandRouter.pushToastMessage('success', "CD Drive", "Ejected");
            self.logger.info('disc ejected');
        });
        
        self.cdController.onLoaded.subscribe(function(drive){
            self.commandRouter.pushToastMessage('success', "CD Drive", "Inserted");	
            self.logger.info('disc loaded');
            self.logger.info('disc info :' + JSON.stringify(self.cdController.getDisc(drive), null, 4));
            self.cdController.setDriveSpeed(drive, self.config.get('readSpeed'));
        });
        
        self.mpdPlugin = self.commandRouter.pluginManager.getPlugin('music_service', 'mpd');
        
        self.commandRouter.executeOnPlugin('music_service', 'mpd', 'registerConfigCallback', 
            {type: 'music_service', plugin: 'cdplayer', data: 'getMPDConfigString'}
        );


        // Once the Plugin has successfull started resolve the promise
        defer.resolve();
    
        return defer.promise;
    }

    public onStop() {
        let defer=libQ.defer();
    
        // Once the Plugin has successfull stopped resolve the promise
        defer.resolve();
    
        return defer.promise;
    }

    public onRestart () {
        let self = this;
        // Optional, use if you need it
    };

    // Configuration Methods -----------------------------------------------------------------------------
    public saveOptions(data: any) {
        this.config.set('readSpeed', data['readSpeed']);
        for(let drive in this.cdController.getDrives) {
            this.cdController.setDriveSpeed(drive, data['readSpeed']);
        }
    }

    public getUIConfig() {
        let defer = libQ.defer();
        let self = this;
    
        let lang_code = this.commandRouter.sharedVars.get('language_code');
    
        self.commandRouter.i18nJson(__dirname+'/i18n/strings_'+lang_code+'.json',
            __dirname+'/i18n/strings_en.json',
            __dirname + '/UIConfig.json')
            .then(function(uiconf)
            {
                uiconf.sections[0].content[0].value = self.config.get('readSpeed');
    
                defer.resolve(uiconf);
            })
            .fail(function()
            {
                defer.reject(new Error());
            });
    
        return defer.promise;
    };
  
    public setUIConfig(data) {
        let self = this;
        //Perform your installation tasks here
    };
    
    public getConf(varName) {
        let self = this;
        //Perform your installation tasks here
    };
    
    public setConf(varName, varValue) {
        var self = this;
        //Perform your installation tasks here
    };

    public getMPDConfigString(): string {
        let self = this;
        return 'input { \n\tplugin "cdio_paranoia"\n}\n';
    }

// Playback Controls ---------------------------------------------------------------------------------------

    private addToBrowseSources = function () {
        // Use this function to add your music service plugin to music sources
        let data = {
            name: 'Audio CD', 
            uri: 'cdio', 
            plugin_type: 'music_service', 
            plugin_name: 'cdplayer',
            albumart: '/albumart?sourceicon=music_service/cdplayer/icon.png'
        };
        this.commandRouter.volumioAddToBrowseSources(data);
    }

    public handleBrowseUri(curUri: string) {
        let self = this;
        console.log('CDIO: ' + curUri);
        //self.commandRouter.logger.info('CDIO: ' + curUri);
        let response;
    
        if (curUri.startsWith('cdio/eject')) {
            self.cdController.eject(curUri.replace('cdio/eject',''));
            response = self.listRoot(curUri);
        } else if (curUri.startsWith('cdio/tracks')) {
            response = self.listTracks(curUri);
        } else if (curUri.startsWith('cdio')) {
            response = self.listRoot(curUri);
        }
    
        return response;
    }

    private listTracks(cUrl: string) {
        let self = this;
        
        let response = {
            navigation: {
                "prev": {
                    uri: 'cdio'
                },
                "lists":[
                    {
                        "availableListViews": [
                                "list"
                        ],
                        "items": [
    
                        ]
                    }
                ]
            }
        }

        let split = self.parseUri(cUrl);
        self.logger.info('request tracks for ' + split.drive);
        let driveState: ICDState = self.cdController.getDisc(split.drive);
        console.dir(driveState);
        if(driveState.loaded) {
            let disc = driveState.disc;
            for(let track of disc.tracks)
            {
                if(track) {
                    var song = {
                        service: 'cdplayer',
                        type: 'song',
                        trackType: 'CD',
                        artist: disc.artist,
                        album: disc.discName,
                        albumart: disc.cover,
                        title: track.name,
                        uri: 'cdio/tracks' + split.drive + '/' + track.track,
                        icon: 'fa fa-music'
                    };
                    response.navigation.lists[0].items.push(song);
                 }
            }
        }
        return libQ.resolve(response);
    }
    
    private listRoot(cUrl: string) {
        let self=this;
    
        let response = {
            navigation: {
                prev: {
                    uri: 'cdio'
                },
                lists: [{
                    "title": "Audio CD",
                    "icon": "fa fa-folder-open-o",
                    "availableListViews": ["list","grid"],
                    "items": []
                }]
            }
        };

        let drives: IDrives = self.cdController.getDrives;
        for(let drive in drives)
        {
            let driveState = self.cdController.getDisc(drive);  
            self.logger.info(JSON.stringify(driveState, null, 4));
            let disc = driveState.disc;
            let item = {
                service: 'cdplayer',
                type: 'folder',
                title: 'Tracks' + (driveState.loaded ? ' - ' + disc.discName : ''),
                artist: disc.artist,
                album: disc.discName,
                albumart: disc.cover,
                icon: 'fa fa-folder-open-o',
                uri: 'cdio/tracks' + drive
            };
            response.navigation.lists[0].items.push(item);
        
            let eject = {
                service: 'cdplayer',
                type: 'folder',
                title: 'Eject' + (driveState.loaded ? ' - ' + disc.discName : ''),
                artist: '',
                album: '',
                icon: 'fa fa-eject',
                uri: 'cdio/eject' + drive
            }
            response.navigation.lists[0].items.push(eject);
        }
        
        return libQ.resolve(response);
    }
    
    // Define a method to clear, add, and play an array of tracks
    public clearAddPlayTrack(track) {
        let self = this;
        self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerCdio::clearAddPlayTrack');

        self.commandRouter.logger.info(JSON.stringify(track));

        return self.mpdPlugin.sendMpdCommand('stop',[])
            .then(function()
            {
                return self.mpdPlugin.sendMpdCommand('clear',[]);
            })
            .then(function()
            {
                return self.mpdPlugin.sendMpdCommand('add "' + track.uri+ '"',[]);
            })
            .then(function()
            {
                self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
                return self.mpdPlugin.sendMpdCommand('play',[]);
            }
        );
    }

    // Seek
    public seek(timepos) {
        this.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerCdio::seek to ' + timepos);

        return; //this.sendSpopCommand('seek '+timepos, []);
    }

    // Stop
    public stop() {
	    let self = this;
        self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerCdio::stop');
        
        return self.mpdPlugin.sendMpdCommand('stop',[]);
    };

    // Pause
    public pause = function() {
	    let self = this;
        self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerCdio::pause');
        return self.mpdPlugin.sendMpdCommand('pause',[]);
    }

    // Get state
    public getState() {
	    let self = this;
	    self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerCdio::getState');
    }

    //Parse state
    public parseState(sState) {
	    let self = this;
	    self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerCdio::parseState');

	    //Use this method to parse the state and eventually send it with the following function
    }

    // Announce updated State
    public pushState(state) {
	    let self = this;
	    self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerCdio::pushState');

	    return ; //self.commandRouter.servicePushState(state, self.servicename);
    }


    public explodeUri (uri: string) {
	    let self = this;
	    let defer = libQ.defer();
        
        self.logger.info('explode: ' +  uri);

        let parts = self.parseUri(uri);
        let drive = self.cdController.getDisc(parts.drive);
        let name = '';
        let time = 0;
        if(drive.loaded) {
            if(parts.track) {
                name = drive.disc.tracks[parts.track].name;
                time = drive.disc.tracks[parts.track].duration;
            } else {
                for(let track of drive.disc.tracks)
                {
                    if(track){
                        time += track.duration;
                    }
                    name = drive.disc.discName;
                }
            }
            self.logger.info(JSON.stringify(drive.disc, null, 4));

            defer.resolve({
                uri: parts.uri,
                service: 'cdplayer',
                name: drive.disc.discName,
                title: name,
                artist: drive.disc.artist,
                type: 'track',
                albumart: drive.disc.cover,
                duration: time,
                trackType: 'CD'
            });
        } else {
            defer.reject(new Error('no disc loaded'));
        }
	    return defer.promise;
    }

    private parseUri(uri: string)
    {
        let self = this;
        let explode = uri.replace('cdio/tracks/', '').split('/')
        let handle = 'cdda://' + explode[0] + '/' + explode[1] + '/';
        if(explode[2]) {
            handle +=  explode[2];
        }

        this.logger.info(JSON.stringify(explode,null,4));

        return {
            drive: '/' + explode[0] + '/' + explode[1], 
            track: explode[2]? explode[2] : '',
            uri:  handle
        }
    }

    public search(query) {
	    let self = this;
	    let defer = libQ.defer();

	    // Mandatory, search. You can divide the search in sections using following functions

	    return defer.promise;
    }

    private searchArtists(results) {

    }

    private searchAlbums(results) {

    }

    private searchPlaylists(results) {

    }

    private searchTracks(results) {

    }
}

export = ControllerCdio;
