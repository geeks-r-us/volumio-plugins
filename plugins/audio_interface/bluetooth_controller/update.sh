#!/bin/bash
tsc -p tsconfig.json
volumio plugin refresh
sudo systemctl restart volumio
sudo journalctl -f 
