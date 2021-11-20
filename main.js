// Modules to control application life and create native browser window
const {
    app,
    Tray,
    Menu,
    clipboard,
    globalShortcut,
    BrowserWindow,
    ipcMain,
    dialog,
    Notification,
    net,
    shell,
} = require("electron");
const os = require("os");
var robot = require("robotjs");
const Store = require("electron-store");

var screen = require("electron").screen;
const path = require("path");
run_path = path.resolve(__dirname, "");
if (app.isPackaged) {
    dev = false;
} else {
    dev = true;
}

app.whenReady().then(() => {
    tray = new Tray(`${run_path}/assets/icons/64x64.png`);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: "自动搜索",
            click: () => {
                auto_open();
            },
        },
        {
            label: "截图搜索",
            click: () => {
                setTimeout(() => {
                    clip_window.webContents.send("reflash");
                    clip_window.show();
                    clip_window.setFullScreen(true);
                }, 500);
            },
        },
        {
            label: "选中搜索",
            click: () => {
                open_selection();
            },
        },
        {
            label: "剪贴板搜索",
            click: () => {
                open_clip_board();
            },
        },
        {
            type: "separator",
        },
        {
            label: "主页面",
            click: () => {
                create_main_window("", "text");
            },
        },
        {
            label: "设置",
            click: () => {
                Store.initRenderer();
                create_setting_window();
            },
        },
        {
            label: "教程帮助",
            click: () => {
                create_help_window();
            },
        },
        {
            type: "separator",
        },
        {
            label: "退出",
            click: () => {
                app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);

    new Notification({
        title: "eSearch",
        body: `eSearch已经在后台启动`,
        icon: `${run_path}/assets/icons/64x64.png`,
    }).show();

    Store.initRenderer();

    ipcMain.on("快捷键", (event, arg) => {
        eval(`${arg[0]} = globalShortcut.register("${arg[1]}", () => {
            ${arg[2]};
        });`);

        event.sender.send("状态", eval(arg[0]));
    });

    store = new Store();

    globalShortcut.register(store.get("key_自动识别") || "CommandOrControl+Shift+Z", () => {
        auto_open();
    });
    if (store.get("key_截图搜索") != undefined)
        globalShortcut.register(store.get("key_截图搜索"), () => {
            clip_window.webContents.send("reflash");
            clip_window.show();
            clip_window.setFullScreen(true);
        });
    if (store.get("key_选中搜索") != undefined)
        globalShortcut.register(store.get("key_选中搜索"), () => {
            open_selection();
        });
    if (store.get("key_剪贴板搜索") != undefined)
        globalShortcut.register(store.get("key_剪贴板搜索"), () => {
            open_clip_board();
        });

    function auto_open() {
        var o_clipboard = clipboard.readText();
        robot.keyTap("c", "control");
        var t = clipboard.readText();
        if (o_clipboard != t) {
            open_clip_board();
        } else {
            clip_window.webContents.send("reflash");
            clip_window.show();
            clip_window.setFullScreen(true);
        }
        clipboard.writeText(o_clipboard);
    }

    // Create the browser window.
    const clip_window = new BrowserWindow({
        icon: path.join(run_path, "assets/icons/1024x1024.png"),
        x: 0,
        y: 0,
        width: screen.getPrimaryDisplay().workAreaSize.width * screen.getPrimaryDisplay().scaleFactor,
        height: screen.getPrimaryDisplay().workAreaSize.width * screen.getPrimaryDisplay().scaleFactor,
        show: false,
        alwaysOnTop: true,
        fullscreenable: true,
        transparent: true,
        frame: false,
        skipTaskbar: true,
        autoHideMenuBar: true,
        movable: false,
        resizable: false,
        enableLargerThanScreen: true, // mac
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        },
    });

    // and load the index.html of the app.
    clip_window.loadFile("capture.html");

    // Open the DevTools.
    if (dev) clip_window.webContents.openDevTools();

    // 监听截图奇奇怪怪的事件
    ipcMain.on("window-close", () => {
        clip_window.setFullScreen(false);
        clip_window.hide();
    });

    ipcMain.on("ocr", (event, arg) => {
        const request = net.request({
            method: "POST",
            url: store.get("ocr_url") || "http://127.0.0.1:8080",
            headers: { "Content-type": "application/x-www-form-urlencoded" },
        });
        request.on("response", (response) => {
            if (response.statusCode == "200") {
                response.on("data", (chunk) => {
                    create_main_window(chunk.toString(), "ocr");
                });
                response.on("end", () => {
                    event.sender.send("ocr_back", "ok");
                });
            } else if (response.statusCode == "404") {
                event.sender.send("ocr_back", "else");
                dialog.showMessageBox({
                    title: "警告",
                    message: "识别失败\n找不到服务器",
                    icon: `${run_path}/assets/icons/warning.png`,
                });
            } else {
                event.sender.send("ocr_back", "else");
                dialog.showMessageBox({
                    title: "警告",
                    message: "识别失败\n请尝试重新识别",
                    icon: `${run_path}/assets/icons/warning.png`,
                });
            }
        });
        access_token = store.get("ocr_access_token") || "";
        data = JSON.stringify({
            access_token: access_token,
            image: arg,
            detect_direction: true,
            paragraph: true,
        });
        request.write(data);
        request.end();
    });

    ipcMain.on("QR", (event, arg) => {
        if (arg != "nothing") {
            create_main_window(arg, "QR");
        } else {
            dialog.showMessageBox({
                title: "警告",
                message: "无法识别二维码\n请尝试重新识别",
                icon: `${run_path}/assets/icons/warning.png`,
            });
        }
    });

    ipcMain.on("save", (event) => {
        save_time = new Date();
        save_name_time = `${save_time.getFullYear()}-${
            save_time.getMonth() + 1
        }-${save_time.getDate()}-${save_time.getHours()}-${save_time.getMinutes()}-${save_time.getSeconds()}-${save_time.getMilliseconds()}`;
        dialog
            .showSaveDialog({
                title: "选择要保存的位置",
                defaultPath: `Screenshot-${save_name_time}.png`,
                filters: [{ name: "Images", extensions: ["png"] }],
            })
            .then((x) => {
                event.sender.send("save_path", x.filePath);
                if (x.filePath) {
                    notification = new Notification({
                        title: "eSearch保存图像成功",
                        body: `已保存图像到${x.filePath}`,
                        icon: `${run_path}/assets/icons/64x64.png`,
                    });
                    notification.on("click", () => {
                        shell.showItemInFolder(x.filePath);
                    });
                    notification.show();
                } else {
                    new Notification({
                        title: "eSearch保存图像失败",
                        body: `用户已取消保存`,
                        icon: `${run_path}/assets/icons/64x64.png`,
                    }).show();
                }
            });
    });

    ipcMain.on("ding", (event, arg) => {
        create_ding_window(arg[0], arg[1], arg[2], arg[3], arg[4]);
    });

    ipcMain.on("move_mouse", (event, arrow, d) => {
        var mouse = robot.getMousePos();
        switch (arrow) {
            case "ArrowUp":
                robot.moveMouse(mouse.x, mouse.y - 1 * d);
                break;
            case "ArrowRight":
                robot.moveMouse(mouse.x + 1 * d, mouse.y);
                break;
            case "ArrowDown":
                robot.moveMouse(mouse.x, mouse.y + 1 * d);
                break;
            case "ArrowLeft":
                robot.moveMouse(mouse.x - 1 * d, mouse.y);
                break;
        }
    });
});

app.on("will-quit", () => {
    // Unregister all shortcuts.
    globalShortcut.unregisterAll();
});

function open_selection() {
    o_clipboard = clipboard.readText();
    robot.keyTap("c", "control");
    t = clipboard.readText();
    if (o_clipboard != t) {
        create_main_window(t, "text");
    }
    clipboard.writeText(o_clipboard);
}

function open_clip_board() {
    t = clipboard.readText();
    create_main_window(t, "text");
}

const windows = {};
function create_ding_window(x, y, w, h, img) {
    ding_name = `ding_window${new Date().getTime()}`;
    windows[ding_name] = new BrowserWindow({
        x: x,
        y: y,
        width: w,
        height: h,
        icon: path.join(run_path, "assets/icons/1024x1024.png"),
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        autoHideMenuBar: true,
        enableLargerThanScreen: true, // mac
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        },
    });

    windows[ding_name].setAspectRatio(w / h);
    windows[ding_name].loadFile("ding.html");
    if (dev) windows[ding_name].webContents.openDevTools();
    windows[ding_name].webContents.on("did-finish-load", () => {
        windows[ding_name].webContents.send("img", img);
        windows[ding_name].webContents.send("window_name", ding_name);
        windows[ding_name].webContents.send("window_size", [w, h]);
        windows[ding_name].webContents.send("window_position", [x, y]);
    });
    ipcMain.on("ding_close", (enent, arg) => {
        windows[arg].close();
    });
    ipcMain.on("ding_minimize", (enent, arg) => {
        windows[arg].minimize();
    });
    ipcMain.on("ding_resize", (enent, name, dx, dy, w, h, zoom) => {
        var nw = windows[name].getBounds().width;
        var nh = windows[name].getBounds().height;
        var x = windows[name].getBounds().x + dx - w * zoom * (dx / nw);
        var y = windows[name].getBounds().y + dy - h * zoom * (dy / nh);
        windows[name].setBounds({
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(w * zoom),
            height: Math.round(h * zoom),
        });
    });
    ipcMain.on("ding_back", (enent, name, p, s) => {
        windows[name].setBounds({ x: p[0], y: p[1], width: s[0], height: s[1] });
    });
    ipcMain.on("move", (enent, name, v) => {
        if (v == "down") {
            var ding_xy = windows[name].getBounds();
            var m_xy = screen.getCursorScreenPoint();
            moving = true;
        } else {
            // up
            moving = false;
        }
        function move_ding() {
            if (moving) {
                var n_m_xy = screen.getCursorScreenPoint();
                windows[name].setBounds({ x: ding_xy.x + n_m_xy.x - m_xy.x, y: ding_xy.y + n_m_xy.y - m_xy.y });
                setTimeout(move_ding, 10);
            }
        }
        move_ding();
    });
}

function create_main_window(t, type) {
    const main_window = new BrowserWindow({
        x: screen.getCursorScreenPoint().x,
        y: screen.getCursorScreenPoint().y,
        minWidth: 800,
        icon: path.join(run_path, "assets/icons/1024x1024.png"),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        },
    });

    main_window.loadFile("index.html");
    if (dev) main_window.webContents.openDevTools();
    main_window.webContents.on("did-finish-load", () => {
        main_window.webContents.send("text", [t, type]);
    });

    ipcMain.on("edit", (enent, v) => {
        switch (v) {
            case "cut":
                main_window.webContents.cut();
                break;
            case "copy":
                main_window.webContents.copy();
                break;
            case "paste":
                main_window.webContents.paste();
                break;
        }
    });
}

function create_setting_window() {
    const main_window = new BrowserWindow({
        icon: path.join(run_path, "assets/icons/1024x1024.png"),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        },
    });

    main_window.loadFile("setting.html");
    if (dev) main_window.webContents.openDevTools();
}

function create_help_window() {
    const main_window = new BrowserWindow({
        icon: path.join(run_path, "assets/icons/1024x1024.png"),
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        },
    });

    main_window.loadFile("help.html");
    if (dev) main_window.webContents.openDevTools();
}
