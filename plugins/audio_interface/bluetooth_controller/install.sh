#!/bin/bash

echo "Installing Bluetooth Dependencies"
sudo apt-get update
sudo apt-get install -y libasound2-dev dh-autoreconf libortp-dev bluez pi-bluetooth bluez-tools libbluetooth-dev libusb-dev libglib2.0-dev libudev-dev libical-dev libreadline-dev libsbc1 libsbc-dev

echo "Cloning Bluez-Alsa repo"
cd /tmp
git clone https://github.com/Arkq/bluez-alsa.git

echo "Building Bluez-Alsa"
cd bluez-alsa
autoreconf --install
mkdir build && cd build
../configure --disable-hcitop --with-alsaplugindir=/usr/lib/arm-linux-gnueabihf/alsa-lib
make 

echo "Installing Bluez-Alsa"
sudo make install

cat > /lib/systemd/system/bluezalsa.service <<EOC
[Unit]
Description=BluezAlsa proxy
Requires=bluetooth.service
After=bluetooth.service
[Service]
Type=simple
User=root
Group=audio
ExecStart=/usr/bin/bluealsa --disable-hfp
[Install]
WantedBy=multi-user.target
EOC

sudo systemctl daemon-reload
sudo systemctl enable bluezalsa.service

#requred to end the plugin install
echo "plugininstallend"
