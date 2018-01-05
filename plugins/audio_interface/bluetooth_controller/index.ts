// load external modules
import libQ = require('kew');
import fs = require('fs-extra');
import io = require('socket.io-client');
import blue = require('bluetoothctl');
//import cp = require('child_process');
import conf = require('v-conf');
import avrcp = require('./AVRCP')

declare var __dirname : string;

interface IMethodCallResponse {message: string, payload: any}
interface IState{ hasBluetooth: boolean, devices: any}

blue.Bluetooth();

// Define the BluetoothController class
class BluetoothController{
    context: any;
    commandRouter: any;
    logger: any;
    configManager: any;
    config: any;
    avrcpMonitor: any;
    socket: any;
    
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
        
        return defer.promise;
    }
    
    // Volumio needs this
    public getConfigurationFiles() : string[] {
        return ['config.json'];
    }

    // define behaviour on plugin activation
    public onStart() {
        let self = this;
        let defer = libQ.defer();

        this.socket = io.connect('http://localhost:3000');
        
        blue.on(blue.bluetoothEvents.DeviceSignalLevel, function(devices, mac, signal){
            // send to gui
        });

        blue.on(blue.bluetoothEvents.Device, function(devices)
        {
            // send to gui

            self.deviceListChanged(devices);
        });

        this.initBluetooth();
        this.avrcpMonitor = new avrcp(this.context);
        this.avrcpMonitor.onKeyPress.subscribe(function(event) {
            self.logger.info('Received Key: ' + event.code);
            switch(event.code)
            {
                case 165: // prev
                    self.socket.emit('prev');
                    break;
                case 163: // next
                    self.socket.emit('next');
                    break;
                case 200: // start 
                    self.socket.emit('play');
                    break;
                case 201: // pause
                    self.socket.emit('pause');
                    break;
            }
        });
    
        self.commandRouter.executeOnPlugin('music_service', 'mpd', 'registerConfigCallback', 
            {type: 'audio_interface', plugin: 'bluetooth_controller', data: 'getMPDConfigString'}
        );

        defer.resolve();
        return defer.promise;
    }

    // define behaviour on plugin deactivation.
    public onStop() {
        let defer = libQ.defer();
        
        // stop avrcp
        delete this.avrcpMonitor;
        this.socket.close();

        return defer.promise;
    }

    // initialize Plugin settings page
    public getUIConfig() {
        let self = this;
        let defer = libQ.defer();
        this.logger.info('Discoverable: ' + this.config.get('discoverable'));
    
        let lang_code = this.commandRouter.sharedVars.get('language_code');
        this.commandRouter.i18nJson(__dirname + '/i18n/strings_' + lang_code + '.json',
            __dirname + '/i18n/strings_en.json',
            __dirname + '/UIConfig.json')
            .then(function(uiconf : any) {
                uiconf.sections[0].content[0].value = self.config.get('discoverable');
                defer.resolve(uiconf);
            })
            .fail(function () {
                defer.reject(new Error());
            });
    
        return defer.promise;
    }

    // define what happens when the user clicks the 'save' button on the settings page
    public saveOptions(data: any){
        let successful = true;
    
        // save discoverable setting to our config
        this.config.set('discoverable', data['discoverable_setting']);
        this.initBluetooth();
    
        this.commandRouter.pushToastMessage('success', 
            this.commandRouter.getI18nString('BLUETOOTH_SETTINGS'), 
            this.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
    }

    // allow mpd to collect configured bluetooth devices
    public getConfigParam(key: string) : any {
        let result = this.config.get(key);
        if(!result) {
            let keys = this.config.getKeys(key)
            this.logger.info('Keys : ' + JSON.stringify(keys, null,4));
            
            if(keys.length > 0) {
                result = [];
                for(var i = 0; i < keys.length; ++i) {
                    var value  = this.config.get(key + '.' + keys[i]);
                    result.push(JSON.parse(value));
                }   
            }
        }
        return result;
    }

    // initialize bluetooth controller and start scan
    private initBluetooth() : void {
        let hasBluetooth = blue.checkBluetoothController();
        if (hasBluetooth) {
            this.logger.info('Set bluetooth disvoverable to ' + this.config.get('discoverable'));
            blue.discoverable(this.config.get('discoverable'));
            this.startScan();
        }    
    }

    // start scan for bluetooth devices
    private startScan() : void {
        let self = this;
        this.logger.info('Starting bluetooth device scan');
        blue.scan(true);
        // stop scan after a while to prevent playback issues
        setTimeout(function() {
            self.logger.info('Stopping bluetooth device scan');
            blue.scan(false);
        }, 20000);
    }  

    // return list of bluetooth devices
    public getBluetoothDevices() {
        // start scanning 
        this.startScan();
        

        // build result
        let result : IMethodCallResponse = {
            message: "pushBluetoothDevices", 
            payload: { 
                hasBluetooth: blue.checkBluetoothController(), 
                devices: blue.devices 
            }
        };

        this.logger.info('Found bluetooth devices: ' + JSON.stringify(result, null, 4));
        
        return result; 
    }

    private deviceListChanged(devices: any) {
        let self = this;
        self.logger.info('Device list changed: ');
        for (var device of devices) {
            self.logger.info(JSON.stringify(device, null, 4));
            if(device.trusted) {
                self.avrcpMonitor.addDevice(device.mac.toString());
            }
        }
    }
    
    // connects the specified bluetooth device            
    public connectBluetoothDevice(data: any) {
        let mac = data.mac.toString();
        this.logger.info('Connecting bluetooth devices: ' + mac);
        blue.pair(mac);
        blue.trust(mac);
        blue.connect(mac);

        this.avrcpMonitor.addDevice(mac);
    
        let key = 'pairedDevices.' + mac;
        let already_known = this.config.has(key);
        this.logger.info('known: '+ already_known);
        if(!already_known) {
            let device = blue.devices.filter( function(item: any) {
                return item.mac == mac;
            })[0];

            this.logger.info(JSON.stringify(device, null, 4));
            this.config.addConfigValue(key,'string', JSON.stringify(device));
        }
        this.updateMPD();
        //self.writeAsoundFile(mac);
    
        return this.getBluetoothDevices();
    }

    // disconnects the specified bluetooth device
    public disconnectBluetoothDevice(data: any) {
    
        let mac : string = data.mac.toString();
        this.logger.info('Disconnecting bluetooth devices: ' + mac);
        
        this.avrcpMonitor.removeDevice(mac);
        blue.disconnect(mac);
        blue.untrust(mac);
        blue.remove(mac);
    
        let key = 'pairedDevices.'+ mac;
        this.config.delete(key);
        this.updateMPD();

        return this.getBluetoothDevices();
    }

    public getMPDConfigString():string {
        let self = this;
        
        let btconfig = self.getConfigParam('pairedDevices');
        let btdata = '';
        if (btconfig) {
            
            for(let device of btconfig) {
                btdata += 'audio_output { \n\ttype "alsa"\n\tname "' +  device.name + '"\n\t'
                btdata += 'device "bluealsa:HCI=hci0,DEV=' + device.mac + ',PROFILE=a2dp" \n\t'
                btdata += 'mixer_type "software"\n}\n'
            }
        }
        
        return btdata;
    }

    // update the mpd conf file
    private updateMPD() {
        let result = this.commandRouter.executeOnPlugin('music_service', 'mpd', 'createMPDFile', function(error: string ) {
            if(error)
                this.commandRouter.pushToastMessage('Error', error);    
        });
    }

    public getPaired() {
        let defer = libQ.defer();
    
        defer.resolve(blue.getPairedDevices);
        return defer.promise;
    }

    public getBluetoothAvailable() {
        let defer = libQ.defer();
    
        defer.resolve( blue.checkBluetoothController());
        return defer.promise;
    }
}

export = BluetoothController;


/*
BluetoothController.prototype.writeAsoundFile = function(mac) {
	var self = this;
    var defer = libQ.defer();
	self.logger.info('Change softmixer device for audio device to:' + mac);


	var asoundcontent = '';

    if (mac !== undefined)
    {
        asoundcontent += 'defaults.bluealsa { \n';
        asoundcontent += 'interface "hci0"            # host Bluetooth adapter \n';
        asoundcontent += '   device "' + mac + '"  # Bluetooth headset MAC address \n';
        asoundcontent += '   profile "a2dp" \n';
        asoundcontent += '}\n';
    }


	fs.writeFile('/home/volumio/.asoundrc', asoundcontent, 'utf8', function(err) {
		if (err) {
			self.logger.info('Cannot write /var/lib/mpd/.asoundrc: ' + err);
		} else {
			self.logger.info('asoundrc file written');
			var mv = execSync('/usr/bin/sudo /bin/mv /home/volumio/.asoundrc /var/lib/mpd/.asoundrc', { uid:1000, gid: 1000, encoding: 'utf8' });
			var apply = execSync('/usr/sbin/alsactl -L -R nrestore', { uid:1000, gid: 1000, encoding: 'utf8' });
			var apply3 = execSync('/usr/sbin/alsactl -L -R nrestore', { uid:1000, gid: 1000, encoding: 'utf8' });
		}
	});
};


*/