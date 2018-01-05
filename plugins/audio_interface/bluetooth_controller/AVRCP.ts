import udev = require('udev');
import InputEvent = require('input-event');
import {SimpleEventDispatcher, ISimpleEvent} from 'strongly-typed-events';

interface DeviceListEntry {
    virtualPath: string,
    devicePath: string,
    inputEvent : any
}

interface DeviceList {
    [mac: string]: DeviceListEntry;
}

class AVRCPController {
    private udevMonitor : any;
    private context : any;
    private logger: any
    private devicelist : DeviceList;
    private keyPressEvent = new SimpleEventDispatcher<any>();

    constructor(context : any)
    {
        this.context = context;
        this.logger = this.context.logger;
        this.udevMonitor = udev.monitor();
        this.devicelist = {};

        this.udevInit();
    }

    public udevInit() {
        let self = this;
        self.udevMonitor.on('add', function(device: any) {
            self.logger.info('added device ' + JSON.stringify(device,null,4));
            
            if(device.DEVPATH.startsWith('/devices/virtual/input/')) {
                if(device.DEVNAME && device.DEVNAME.startsWith('/dev/input/')) {
                    self.handleInputEvent(device);
                } else {
                    self.handleInputDevice(device);
                }
            }      
        });
    
        self.udevMonitor.on('remove', function(device: any){
            self.logger.info('removed device ' + JSON.stringify(device,null,4));
            if(device.DEVNAME) {
                for(let mac in self.devicelist) {
                    if(self.devicelist[mac].devicePath == device.DEVNAME) {
                        self.devicelist[mac].inputEvent.close();
                    }
                }
            }
        });
    }

    private handleInputDevice(device:any) {
        let self = this;
        let stripedName = device.NAME.replace(/['"]+/g, '');
        self.logger.info('AVRCP: found new input device from MAC '+ stripedName);
        
        if(self.devicelist[stripedName]) {
            self.logger.info('AVRCP: accepted input device');
            self.devicelist[stripedName].virtualPath = device.DEVPATH;
        } else {
            self.logger.info('AVRCP: not accepted input device');
        }
    }

    private handleInputEvent(device:any) {
        let self = this;
        self.logger.info('AVRCP: new input event found :' + device.DEVPATH );
        
        for( let mac in self.devicelist) {
            self.logger.info('AVRCP: testing MAC '+ mac);
            self.logger.info('AVRCP: VP = ' + JSON.stringify(self.devicelist[mac]));
            if (device.DEVPATH.startsWith(self.devicelist[mac].virtualPath)) {
                self.logger.info('AVRCP: accepted input event');
                let item = self.devicelist[mac];
                item.devicePath = device.DEVNAME;
                self.logger.info('AVRCP: added input event');
                let input = new InputEvent(item.devicePath);
                self.logger.info('AVRCP: created input event');
                item.inputEvent = new InputEvent.Keyboard(input);
                self.logger.info('AVRCP: created keyboard');
                self.logger.info('AVRCP: register keyboard for input ' + input);
                item.inputEvent.on('keypress', function (key){
                    self.logger.info('AVRCP detected keypress : ' + key);
                    self.keyPressEvent.dispatch(key);
                });
                return;           
            }
        }
        self.logger.info('AVRCP: not accepdted input event found');
    }

    public get onKeyPress() : ISimpleEvent<any> {
        return this.keyPressEvent.asEvent();
    }

    public addDevice(mac: string) : void {
        let self = this;
        self.logger.info('AVRCP: adding device: ' + mac);
        let known =  self.devicelist[mac];
        if(!known) {
            self.devicelist[mac] = {virtualPath : '', devicePath : '', inputEvent : null};
        }
        self.logger.info('known: '+ JSON.stringify(self.devicelist, null, 4));
    }

    public removeDevice(mac: string) : void {
        let self = this;
        let known = self.devicelist[mac];
        if(known) {
            self.devicelist[mac].inputEvent.close();
            delete self.devicelist[mac];
        }
    }
    
}

export = AVRCPController;
