import udev = require('udev');
import InputEvent = require('input-event');
import {SimpleEventDispatcher, ISimpleEvent} from 'strongly-typed-events';

interface DeviceListEntry {
    virtualPath: string,
    devicePath: string,
    inputEvent : any,
    keyboard: any
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
            self.logger.info('AVRCP: removed device ' + JSON.stringify(device,null,4));
            if(device.DEVNAME) {
                for(let mac in self.devicelist) {
                    if(self.devicelist[mac].devicePath == device.DEVNAME) {
                        self.devicelist[mac].keyboard.close();                        
                        delete self.devicelist[mac].keyboard;
                        self.devicelist[mac].inputEvent.close();
                        delete self.devicelist[mac].inputEvent;
                        self.devicelist[mac].devicePath = "";
                        self.devicelist[mac].virtualPath = "";
                        self.logger.info('AVRCP: removed device '+ mac + ' successfuly');
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
            if (device.DEVPATH.startsWith(self.devicelist[mac].virtualPath)) {
                self.logger.info('AVRCP: accepted input event');
                let item = self.devicelist[mac];
                item.devicePath = device.DEVNAME;
                self.logger.info('AVRCP: added input event');
                item.inputEvent = new InputEvent(item.devicePath);
                item.inputEvent.on('error', function(err){});
                self.logger.info('AVRCP: created input event');
                self.logger.info('AVRCP: created keyboard');
                self.logger.info('AVRCP: register keyboard for input ' + item.inputEvent);
                item.keyboard.on('keypress', function (key){
                    self.logger.info('AVRCP detected keypress : ' + key);
                    self.keyPressEvent.dispatch(key);
                });
                item.keyboard.fd.on('error', function(err){});
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
            self.devicelist[mac] = {virtualPath : '', devicePath : '', inputEvent : null, keyboard : null};
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
