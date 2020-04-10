let VERSION = '1.1.2';

let d = document;
let v = d.getElementById('video');
let container = d.getElementById('container');
let wifi_store = d.getElementById('wifi_store'),
    json_config = d.getElementById('json_config'),
    wifi_msg = d.getElementById('wifi_msg'),
    wifi_pre = d.getElementById('wifi_pre');
let tabs = {
    'ble':d.getElementById('ble-tab'),
    'wifi':d.getElementById('wt-tab'),
    'qr':d.getElementById('qr-tab'),
    'info':d.getElementById('in-tab')
};
let apikey = d.getElementById('apikey'), qr_scan = d.getElementById('qr_scan'), qr_stop = d.getElementById('qr_stop');
let preload_ble = d.getElementById('preload_ble');
let ble_id, ble_type, ble_name, ble_mac = '', ble_enabled = true;
let refreshes = 0;

let storage = window.localStorage;

let device_list_paired = d.getElementById('device_list_paired'),
    device_list_unpaired = d.getElementById('device_list_unpaired'),
    discovery_list = d.getElementById('discovery_list'),
    discovery_enabled = false;

let ble_service_uuid = '0000aaaa-ead2-11e7-80c1-9a214cf093ae';
let ble_wifi_uuid = '00005555-ead2-11e7-80c1-9a214cf093ae';
let config_tab = d.getElementById('cale-tab');
let tabsCollection = config_tab.getElementsByTagName('A');

// typescript doesn't polyfill lib entries
if (!Object.entries) {
  Object.entries = function( obj ){
    var ownProps = Object.keys( obj ),
        i = ownProps.length,
        resArray = new Array(i); // preallocate the Array
    while (i--)
      resArray[i] = [ownProps[i], obj[ownProps[i]]];
    return resArray;
  };
}

// DOMContentLoaded   -> deviceready for cordova
d.addEventListener('deviceready', function(){
    loadFormState();
    QRScanner.prepare(qrPrepare);
    // Screen table
    tableScreen();

    if (apikey.value == '') {
        QRScanner.show();
        // Start a scan. Scanning will continue until something is detected or `QRScanner.cancelScan()` is called.
        QRScanner.scan(qrDisplayContents);
    }
    qr_scan.onclick = function(){
        containerQr();
        QRScanner.show();
        QRScanner.scan(qrDisplayContents);
    }
    qr_stop.onclick = function(){
      qrStop();
    }

    // Bootstrap tabsCollection
    for (var i = 0; i < tabsCollection.length; i++) {
      new Tab(tabsCollection[i],{});
    }

    // Tab events
    tabs['ble'].onclick = function(b) {
       setTimeout(blePreload, 15000);
    };

    // mDns discovery
    var zeroconf = cordova.plugins.zeroconf;
    zeroconf.registerAddressFamily = 'ipv4';
    zeroconf.watchAddressFamily = 'ipv4';

    // Start - EventListeners
    d.getElementById('main-form').onchange = function() {
        saveFormState();
    };

    wifi_store.onchange = function() {
       if (wifi_store.checked) {
          wifi_msg.innerHTML = '<span style="color:red"><b>Security:</b> When you are done leave it unchecked</span>';
       } else {
          wifi_msg.innerText = 'Config was removed from local storage'
       }
    }

    // Blue App
    let blue = {
        list: function() {
            device_list_paired.innerHTML = '';
            device_list_unpaired.innerHTML = '';
            d.getElementById('ble_msg_foot').innerText = '';
            ble.startScan([], blue.onDiscoverBle, function(error) {
               ble_msg.innerText = error;
            });

            setTimeout(ble.stopScan, 1000,
                function() {
                bluetoothSerial.list(
                    function(bs) {
                        d.getElementById('ble_msg').innerText = 'Bluetooth scan. Select target:';

                        for (var i in bs) {
                            blue.addDevice(bs[i], 'serial', true)
                        }

                        bluetoothSerial.discoverUnpaired(function(bs) {
                             for (var i in bs) {
                                 blue.addDevice(bs[i], 'serial', false)
                             }
                         }, function(error) {
                                d.getElementById('ble_msg_foot').innerText = JSON.stringify(error);
                            });
                    },
                    function(error) {
                        d.getElementById('ble_msg_foot').innerText = JSON.stringify(error);
                    }
                );
                }, function() {}
            );
        },
        onDiscoverBle: function(device) {
            // Filter devices starting by ESP* Note for BLE only devices starting with ESP are supported
            if (typeof(device.name) !== 'undefined' && device.name.match(/ESP/i)) {
                blue.addDevice(device, 'ble')
            }
        },
        notEnabled: function() {
            ble_enabled = false;
            blue.showError('BLUETOOTH IS NOT ENABLED');
        },
        removeDiscovery: function (service) {
            if (typeof d.getElementById(service.name) == 'undefined') return;
            d.getElementById(service.name).remove();
        },
        addDiscovery: function (service) {
            if (service.ipv4Addresses.length === 0) return;
            let buttonClass = 'btn-default';
            if (ble_mac !== '' && service.name.indexOf(ble_mac) !== -1) {
                buttonClass = 'btn-success';
            };

            var service_item = d.createElement('button');
            service_item.setAttribute('class', 'form-control btn active '+ buttonClass);
            service_item.setAttribute('style', 'margin-top:2px');
            service_item.setAttribute('type', 'button');
            service_item.setAttribute('id', service.name);
            service_item.dataset.ip = service.ipv4Addresses[0];

            // Guess port from name_PORT if name is formatted correctly
            name_parts = service.name.split('_');

            if (name_parts.length>1) {
               service_item.dataset.port = name_parts[1];
            } else {
               service_item.dataset.port = '';
            }

            service_item.innerHTML = service.name;

            service_item.onclick = function(b) {
                ip.value = b.target.getAttribute('data-ip');
                if (b.target.getAttribute('data-port').length) {
                 port.value = b.target.getAttribute('data-port');
                }
                let port_part = (port.value !== '') ? ':'+port.value : '';
                disco_msg.innerText = "Setting IP to "+ip.value+port_part;
                blue.discoveryDisable();
                return false;
            };
            discovery_list.appendChild(service_item);
        },
        addDevice: function (device, typ, paired = false) {
            if (typeof device === 'undefined' || typeof device.name === 'undefined') return;
            device_mac = (typeof device.address !== 'undefined') ? device.address.replace(/:/g,'') :'';
            var listItem = d.createElement('button');
            listItem.setAttribute('class', 'form-control btn btn-default active');
            listItem.setAttribute('type', 'button');
            listItem.setAttribute('style', 'margin-top:2px');
            listItem.dataset.id = device.id;
            listItem.dataset.type = typ;
            listItem.dataset.name = device.name;
            listItem.dataset.mac = device_mac.substring(0,10);
            listItem.innerHTML = device.name;
            listItem.onclick = function(b) {
                ble_id = b.target.getAttribute('data-id');
                ble_type = b.target.getAttribute('data-type');
                ble_name = b.target.getAttribute('data-name');
                ble_mac = b.target.getAttribute('data-mac');
                wifi_msg.innerHTML = "<small>"+ble_name+"</small>";
                let wifiTabInit = tabsCollection[1].Tab;
                blue.startConnection();
                wifiTabInit.show();
                return false;
            };
            if (paired) {
              device_list_paired.appendChild(listItem);
            } else {
              device_list_unpaired.appendChild(listItem);
            }

        },
        discoveryShowScan: function() {
            disco_msg.innerText = 'WiFi scanning .local devices';
        },
        discoveryEnable: function() {
           discovery_enabled = true;

           zeroconf.watch('_http._tcp.', 'local.', function(result) {
                var action = result.action;
                var service = result.service;
                switch (action) {
                   case 'resolved':
                     blue.addDiscovery(service);
                     break;
                   case 'removed':
                     blue.removeDiscovery(service);
                     break;
                     }
                if (ble_mac !== '') {
                   disco_msg.innerHTML = 'Last connected: <span style="color:green">'+ble_mac+'</span>';
                }
           });
           setTimeout(blue.discoveryShowScan, 3000);
        },
        discoveryDisable: function() {
            discovery_enabled = false;
            zeroconf.unwatch('_http._tcp.', 'local.',
            function() {},function(error) {
               disco_msg.innerText = 'unwatch error:'+error;
            });
        },
        sendMessage: function(message) {
            if (ble_type === 'serial') {
              bluetoothSerial.write(message+ "\n");
            } else {
              let ble_msg = str2buffer(message);
              ble.write(ble_id, ble_service_uuid, ble_wifi_uuid, ble_msg, blue.display, blue.showError);
            }

        },
        startConnection: function() {
            bluetoothSerial.isEnabled(
                bluetoothSerial.isConnected(blue.disconnect, blue.connect),
                blue.notEnabled
            );
        },
        connect: function() {
            if (ble_type === 'serial') {
                    d.getElementById('ble_msg_foot').innerText = "serial: connecting to "+ble_id;
                    bluetoothSerial.connect(
                        ble_id,         // device to connect
                        blue.openPort,  // start listening
                        blue.showError
                    );
                } else {
                    ble.connect(ble_id, blue.openPort, blue.disconnect);
                }
        },
        connectForIp: function() {
                    if (ble_type === 'serial') {
                            bluetoothSerial.connect(
                                ble_id,         // device to connect
                                blue.openPortForIp,  // start listening
                                blue.showError
                            );
                        } else {
                            ble.connect(ble_id, blue.openPortForIp, blue.disconnect);
                        }
                },
        disconnect: function () {
             if (ble_type === 'serial') {
                    bluetoothSerial.disconnect(
                        blue.closePort,     // stop listening to the port
                        blue.showError      // show the error if you fail
                    );
                } else {
                    ble.disconnect(
                        blue.closePort,     // stop listening to the port
                        blue.showError      // show the error if you fail
                    );
                }
        },
        openPort: function() {
            if (ble_type === 'serial') {
                bluetoothSerial.subscribe('\n', function (data) {
                    blue.displayClear();
                    blue.display(data);
                });
            }
        },
        openPortForIp: function() {

                    if (ble_type === 'serial') {
                        bluetoothSerial.subscribe('\n', function (data) {
                            blue.displayClear();
                            blue.display(data);
                        });

                        blue.sendMessage('{"getip":"true"}')
                    }
                },
        closePort: function() {
            if (ble_type === 'serial') {
                bluetoothSerial.unsubscribe(
                        function (data) {
                            blue.display(data);
                        },
                        blue.showError
                );
            }
        },
        showError: function(error) {
            wifi_foot_msg.innerHTML = '<span color="red"><b>'+ error +'</b></span>';
        },
        display: function(message) {
            lineBreak = document.createElement("br"),
            label = document.createTextNode(message);
             wifi_foot_msg.appendChild(lineBreak);
             wifi_foot_msg.appendChild(label);
        },
        displayClear: function() {
            wifi_foot_msg.innerHTML = "";
        },
        showPreload: function(el) {
            el.style.visibility = 'visible';
        },
        hidePreload: function(el) {
            el.style.visibility = 'hidden';
            preload_ble.style.visibility = 'hidden';
        },
        postWifiSend: function(){
            blue.hidePreload(wifi_pre);
            wifi_msg.innerHTML = 'Settings sent. Restarting';
        },
        start: function() {
           bluetoothSerial.isEnabled(
                    blue.list,
                    blue.notEnabled
           );
        }
     };
     // Start BLUE discovery
     blue.start();


     d.getElementById('wt-tab').onclick = function() {
        blue.discoveryDisable();
        return false;
     }
     d.getElementById('ble-tab').onclick = function() {
        blue.discoveryDisable();
        blue.displayClear();
        blue.start();
        return false;
     }
     d.getElementById('ble_reset').onclick = function() {
        blue.displayClear();
        blue.sendMessage('{"reset":"true"}');
        return false;
     }

    // Send WiFi configuration to ESP32
    ble_set_config.onclick = function() {
        if (json_config.value !== '') {
            if (isValidJson(json_config.value)) {
             blue.sendMessage(json_config.value);
             wifi_msg.innerText = "Sending AP to "+ble_name;
             blue.showPreload(wifi_pre);
             setTimeout(blue.postWifiSend, 5000);
             } else {
                 json_config.style.borderColor = "red";
                 wifi_msg.innerHTML = '<span style="color:red">Not a valid JSON text</span>';
             }
        } else {
            json_config.style.borderColor = "red";
            wifi_msg.innerHTML = '<span style="color:red">Please paste the JSON text from CALE Screen config</span>';
        }
        return false;
    }
    d.getElementById('version').innerText = "App version:"+VERSION;
},false);

/**
 * Saves form state to chrome.storage.local
 * @param $form to save in localstorage(jQuery object)
 */
function saveFormState() {
  const form = d.querySelector('form');
  const data = objectFromEntries(new FormData(form).entries());
  if (!wifi_store.checked) {
     data.json_config = '';
  }
  let formJson = JSON.stringify(data);
  storage.setItem('form', formJson);
}
  
/**
* Loads form state from chrome.storage.local
*/
function loadFormState() {
    const formData = storage.getItem('form');
    if (formData == null || typeof formData !== 'string') return;
    formKeyValue = JSON.parse(formData);
    for (var item in formKeyValue) {
        if (typeof document.getElementsByName(item)[0] !== 'undefined') {
           document.getElementsByName(item)[0].value = formKeyValue[item];
        }
    }
    //dropdownSet(protocol, storage.getItem('protocol'));
}

function cleanTransmission(){
    transmission.textContent = '';
    transmission.className = 'white';
}

// Polyfill for Object.fromEntries()
function objectFromEntries(iter) {
  const obj = {};
  for (const pair of iter) {
    if (Object(pair) !== pair) {
      throw new TypeError('iterable for fromEntries should yield objects');
    }
    const { '0': key, '1': val } = pair;
    Object.defineProperty(obj, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: val,
    });
  }
  return obj;
}

// Form helpers
function dropdownSet(selectObj, valueToSet) {
    for (var i = 0; i < selectObj.options.length; i++) {
        if (selectObj.options[i].value == valueToSet) {
            selectObj.options[i].selected = true;
            return;
        }
    }
}

function isValidJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

function containerWhite() {
  /*body = document.getElementsByTagName("body")[0];
  body.style.background = 'white';*/
  container.style.background = 'white';
}
function containerQr() {
  container.style.background = 'none transparent';
}
function blePreload(){
  preload_ble.style.visibility = 'hidden';
}
// QR code scan
function qrPrepare(err, status){
  if (err) {
   console.error(err);
  }
  if (status.authorized) {
    console.log('QR: status.authorized');
    // W00t, you have camera access and the scanner is initialized: QRscanner.show() should feel very fast.
  } else if (status.denied) {
    console.log('QR: status.denied');
   // The video preview will remain black, and scanning is disabled. use QRScanner.openSettings()
  }
}
function qrStop(){
   QRScanner.destroy(function(status){
     console.log(status);
   });
   containerWhite();
}
function qrDisplayContents(err, text){
     if(err){
        console.log('QR: qrDisplayContents '+err);
       // an error occurred, or the scan was canceled (error code `6`)
     } else {
       // The scan completed, display the contents of the QR code:
       qrStop();
       apikey.value = text;
       alert("ApiKey transferred:\n"+text);
       saveFormState();
     }
}

function refreshTable(tableName, data, orderColumns = []) {
    refreshes++;
    if (refreshes>1) {
        t = $(tableName).DataTable();
        t.destroy();
    }
    t = $(tableName).dataTable({
        retrieve: true,
        dom: '<"col-md-12 text-right">tip',
        data: data.data,
        columns: data.columns,
        order: orderColumns,
        "fnInitComplete": function (oSettings) {
            let purge = document.getElementById('purge');
            if (oSettings.aoData.length>99) {
                purge.style.visibility = 'visible';
            }
        }
    });
}

function tableScreen() {
     console.log(refreshes);
            var data,
                    tableName= '#screen',
                    columns,
                    str,
                    jqxhr = $.ajax('./js/data.json')
                            .done(function () {
                                data = JSON.parse(jqxhr.responseText);
                    if (!refreshes){
                    $.each(data.columns, function (k, colObj) {
                        str = '<th>' + colObj.name + '</th>';
                        $(str).appendTo(tableName+'>thead>tr');
                    });
                    }
                    // Add some Render transformations to Columns
                    data.columns[0].render = function (data, type, row) {
                        return '<small>' + data + '</small>';
                    }
                    refreshTable(tableName, data, [[1, 'desc']]);
                })
            .fail(function (jqXHR, exception) {
                var msg = '';
                if (jqXHR.status === 0) {
                    msg = 'Not connect.\n Verify Network.';
                } else if (exception === 'parsererror') {
                    msg = 'Requested JSON parse failed.';
                } else {
                    msg = 'Uncaught Error.\n' + jqXHR.responseText;
                }
                console.log(msg);
            });
}
