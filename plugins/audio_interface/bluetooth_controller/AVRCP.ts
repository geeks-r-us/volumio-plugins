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

            // get virtual path
            if(device.NAME && self.devicelist[device.NAME.replace(/['"]+/g, '')]) {
                self.devicelist[device.NAME].virtualPath = device.DEVPATH
            }
            else if (device.DEVPATH) {
                for( let mac in self.devicelist) {
                    if (self.devicelist[mac].virtualPath == device.DEVPATH ) {
                        let item = self.devicelist[mac];
                        item.devicePath == device.DEVNAME;
                        let input =  InputEvent(item.devicePath);
                        let keyboard = new InputEvent.Keyboard(input);
                        keyboard.on('keypress', function (key){
                           self.keyPressEvent.dispatch(key);
                        });
                        item.inputEvent = keyboard;
                    }
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

    public get onKeyPress() : ISimpleEvent<any> {
        return this.keyPressEvent.asEvent();
    }

    public addDevice(mac: string) : void {
        let self = this;
        let known =  self.devicelist[mac];
        if(!known) {
            self.devicelist[mac] = {virtualPath : '', devicePath : '', inputEvent : null};
        }
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