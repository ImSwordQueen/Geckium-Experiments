// ==UserScript==
// @name        Geckium - Downloads Manager
// @author		AngelBruni
// @description	Downloads Manager made to adapt to different Chromium designs.
// @loadorder   3
// ==/UserScript==

/**
 * THIS IS SUPER EXPERIMENTAL, IT WILL HAVE BUGS.
 */

const gkDownloadManagerBundle = Services.strings.createBundle("chrome://geckium/locale/properties/gkdownloadmanager.properties");

const { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
handlerSvc = Cc["@mozilla.org/uriloader/handler-service;1"].getService(
	Ci.nsIHandlerService
);

class gkDownloadManager {
	static paneTemplate = `
	<html:div id="gkDownloadList" />
	<html:div id="gkDownloadActionButtons">
		<button id="gkDownloadShelfShowAll" label="${gkDownloadManagerBundle.GetStringFromName("showAllDownloads")}" />
		<button id="gkDownloadShelfToggle" />
	</html:div>
	`	

	static get shelf() {
		return document.getElementById("gkDownloadShelf");
	}

    static createShelf() {
		const browserElm = document.getElementById("tabbrowser-tabpanels");
        const downloadShelf = document.createElement("div");
		downloadShelf.id = "gkDownloadShelf";				
        gkInsertElm.after(downloadShelf, browserElm);
		downloadShelf.appendChild(MozXULElement.parseXULToFragment(this.paneTemplate));

		document.getElementById("gkDownloadShelfShowAll").addEventListener("click", () => {
			openTrustedLinkIn('about:downloads', 'tab');
			this.toggleShelf("hide");
		})
		document.getElementById("gkDownloadShelfToggle").addEventListener("click", () => {
			this.toggleShelf("hide");	
		});

		Downloads.getList(Downloads.ALL).then(list => {
			list.getAll().then(downloads => {
				// Iterate through all downloads and update UI if Firefox is launched and there are still downloads left
				for (let download of downloads) {
					gkDownloadManager.updateItem(download);
				}
			});

			list.addView({
				onDownloadAdded: download => {
					const downloadItem = gkDownloadManager.createItem(download);
					document.getElementById("gkDownloadList").prepend(downloadItem);
					setTimeout(() => {
						gkDownloadManager.checkItemBounds();
					}, 200);
					addEventListener("resize", () => {
						gkDownloadManager.checkItemBounds();
					});
					
					// Popup Showing check
					document.querySelector(`.item[id="${download.target.path}"] menupopup`).addEventListener("popupshowing", () => {
						if (download.succeeded) {
							// Open when done
							document.querySelector(`.item[id="${download.target.path}"] .openwhendone`).removeAttribute("type");
							document.querySelector(`.item[id="${download.target.path}"] .openwhendone`).removeAttribute("checked");
							document.querySelector(`.item[id="${download.target.path}"] .openwhendone`).setAttribute("data-l10n-id", "places-open");

							// Always open files of this type
							document.querySelector(`.item[id="${download.target.path}"] .alwaysopenthistype`).removeAttribute("hidden");
							const mimeInfo = DownloadsCommon.getMimeInfo(download);
							if (mimeInfo.preferredAction === mimeInfo.useSystemDefault)
								document.querySelector(`.item[id="${download.target.path}"] .alwaysopenthistype`).setAttribute("checked", true);
							else
								document.querySelector(`.item[id="${download.target.path}"] .alwaysopenthistype`).removeAttribute("checked");

							document.querySelector(`.item[id="${download.target.path}"] .pause`).setAttribute("hidden", true);
							document.querySelector(`.item[id="${download.target.path}"] .cancel`).setAttribute("hidden", true);
							document.querySelector(`.item[id="${download.target.path}"] .cancelseparator`).setAttribute("hidden", true);
						} else if (download.canceled && !download.hasPartialData) {
							document.querySelectorAll(`.item[id="${download.target.path}"] menuitem`).forEach(menuitem => {
								menuitem.setAttribute("disabled", true);
							});
						} else {
							// Open when done
							document.querySelector(`.item[id="${download.target.path}"] .openwhendone`).setAttribute("label", gkDownloadManagerBundle.GetStringFromName("openWhenDone"));
							document.querySelector(`.item[id="${download.target.path}"] .openwhendone`).setAttribute("checked", download.launchWhenSucceeded);

							// Always open files of this type
							document.querySelector(`.item[id="${download.target.path}"] .alwaysopenthistype`).setAttribute("hidden", true);

							// Pause
							document.querySelector(`.item[id="${download.target.path}"] .pause`).removeAttribute("hidden");
							if (download.stopped)
								document.querySelector(`.item[id="${download.target.path}"] .pause`).setAttribute("data-l10n-id", "downloads-cmd-resume");
							else
								document.querySelector(`.item[id="${download.target.path}"] .pause`).setAttribute("data-l10n-id", "downloads-cmd-pause");


							document.querySelector(`.item[id="${download.target.path}"] .cancel`).removeAttribute("hidden");
							document.querySelector(`.item[id="${download.target.path}"] .cancelseparator`).removeAttribute("hidden");
						}
					});

					// Open / Open when complete
					document.querySelector(`.item[id="${download.target.path}"] .main`).addEventListener("click", () => {
						if (!download.succeeded && !download.stopped && !download.error) {
							if (download.launchWhenSucceeded)
								download.launchWhenSucceeded = false;
							else
								download.launchWhenSucceeded = true;
						} else if (download.succeeded) {
							download.launch().catch(console.error);
						}
					});
					document.querySelector(`.item[id="${download.target.path}"] .openwhendone`).addEventListener("click", () => {
						if (!download.succeeded && !download.stopped && !download.error) {
							if (download.launchWhenSucceeded)
								download.launchWhenSucceeded = false;
							else
								download.launchWhenSucceeded = true;
						} else if (download.succeeded) {
							download.launch().catch(console.error);
						}
					});


					// Always open files of this type
					document.querySelector(`.item[id="${download.target.path}"] .alwaysopenthistype`).addEventListener("click", () => {
						const mimeInfo = DownloadsCommon.getMimeInfo(download);
						if (!mimeInfo)
							throw new Error("Can't open download with unknown mime-type");

						// User has selected to always open this mime-type from now on and will add this
						// mime-type to our preferences table with the system default option. Open the
						// file immediately after selecting the menu item like alwaysOpenInSystemViewer.
						if (mimeInfo.preferredAction !== mimeInfo.useSystemDefault) {			
							mimeInfo.preferredAction = mimeInfo.useSystemDefault;
							handlerSvc.store(mimeInfo);
							DownloadsCommon.openDownload(download).catch(console.error);
						} else {
						// Otherwise, if user unchecks this option after already enabling it from the
						// context menu, resort to saveToDisk.
							mimeInfo.preferredAction = mimeInfo.saveToDisk;
							handlerSvc.store(mimeInfo);
						}
					});

					// Pause // Resume
					document.querySelector(`.item[id="${download.target.path}"] .pause`).addEventListener("click", () => {
						if (download.stopped)
							download.start();
						else
							download.cancel();
					});
					
					// Show in folder
					document.querySelector(`.item[id="${download.target.path}"] .show`).addEventListener("click", () => {
						let file = new FileUtils.File(download.target.path);
						DownloadsCommon.showDownloadedFile(file);
					});

					// Cancel
					document.querySelector(`.item[id="${download.target.path}"] .cancel`).addEventListener("click", () => {
						download.cancel().catch(() => {});
						download.removePartialData().catch(console.error).finally(() => this.download.target.refresh());
					});

					// Initialize previous bytes and time for download speed calculation
					if (typeof downloadItem.dataset.previousBytes !== undefined)
						downloadItem.dataset.previousBytes = 0;

					if (typeof downloadItem.dataset.previousTime !== undefined)
						downloadItem.dataset.previousTime = Date.now();
				},
				onDownloadChanged: download => {
					gkDownloadManager.updateItem(download);
				},
				onDownloadRemoved: download => {
					const downloadItem = document.querySelector(`.item[id="${download.target.path}"]`);
					if (downloadItem)
						downloadItem.remove();

					if (document.getElementById("gkDownloadList").children.length == 0)
						gkDownloadManager.toggleShelf("hide");
				}
			});
		}).catch(console.error);
    }

	static toggleShelf(toggle) {
		if (!toggle) {
			if (this.shelf.getAttribute("hidden"))
				this.shelf.setAttribute("hidden", false);
			else
				this.shelf.setAttribute("hidden", true);	
		} else {
			switch (toggle) {
				case "show":
					this.shelf.setAttribute("hidden", false);	
					break;
				case "hide":
					this.shelf.setAttribute("hidden", true);
					break;
			}
		}
	}

	static createItem(download) {
		const itemTemplate = `
		<hbox class="item" id="${download.target.path}" style="--gkdownload-progress: 0;">
			<image class="anim-begin" />
			<button class="main" flex="1">
				<html:div class="background">
					<html:div class="normal" />
					<html:div class="hot" />
					<html:div class="active" />
				</html:div>
				<html:div class="progress-container">
					<html:div class="progress-bg" />
					<html:div class="progress-mask" />
				<image class="icon" src="moz-icon://${download.target.path}?size=16&amp;state=normal" />
				</html:div>
				<vbox class="info">
					<label class="name">${download.target.path.split("/").pop()}</label>
					<html:div class="description">
						<label class="size" />
						<label class="eta" />
					</html:div>
				</vbox>
			</button>
			<toolbarbutton class="more" type="menu">
				<html:div class="background">
					<html:div class="normal" />
					<html:div class="hot" />
					<html:div class="active" />
				</html:div>
				<html:div class="separator" />
				<image class="toolbarbutton-icon" type="menu"/>
				<menupopup position="before_start">
					<menuitem type="checkbox" class="openwhendone" />
					<menuitem class="alwaysopenthistype" type="checkbox" label="${gkDownloadManagerBundle.GetStringFromName("alwaysOpenFilesOfThisType")}" />
					<menuseparator />
					<menuitem class="pause" />
					<menuitem class="show" data-l10n-id="downloads-cmd-show-menuitem-2" />	
					<menuseparator class="cancelseparator" />
					<menuitem class="cancel" data-l10n-id="bookmark-panel-cancel" />	
				</menupopup>
			</toolbarbutton>
		</hbox>
		`

		this.toggleShelf("show");

		return MozXULElement.parseXULToFragment(itemTemplate);
	}

	static updateItem(download) {
		const downloadItem = document.getElementById(download.target.path);

		if (downloadItem) {	
			function convertBytes(bytes) {
				const units = [
					gkDownloadManagerBundle.GetStringFromName("byte"),
					gkDownloadManagerBundle.GetStringFromName("kiloByte"),
					gkDownloadManagerBundle.GetStringFromName("megaByte"),
					gkDownloadManagerBundle.GetStringFromName("gigaByte"),
					gkDownloadManagerBundle.GetStringFromName("teraByte")
				];
				let unitIndex = 0;
			
				// Convert bytes to the appropriate unit
				while (bytes >= 1024 && unitIndex < units.length - 1) {
					bytes /= 1024;
					unitIndex++;
				}
			
				return { size: bytes, unit: units[unitIndex] };
			}

			function formatSize(bytes, showUnit = true) {
				const { size, unit } = convertBytes(bytes);
				const formattedSize = size.toFixed(1);
			
				return showUnit ? `${formattedSize} ${unit}` : `${formattedSize}`;
			}

			// Update the downloaded size / total file size using the same unit
			const downloadedSize = formatSize(download.currentBytes);
			const totalSize = formatSize(download.totalBytes);	

			if (download.launchWhenSucceeded) {
				document.querySelector(`.item[id="${download.target.path}"] .size`).textContent = ``;
			} else {
				if (download.totalBytes !== 0)		
					document.querySelector(`.item[id="${download.target.path}"] .size`).textContent = `${formatSize(download.currentBytes, false)}/${totalSize},\xa0`;
				else
					document.querySelector(`.item[id="${download.target.path}"] .size`).textContent = `${downloadedSize}`;
			}
					
			// Calculate and update download speed	
			const remainingBytes = download.totalBytes - download.currentBytes;
			const currentTime = Date.now();

			if (typeof downloadItem.dataset.previousTime !== undefined)
				var elapsedTime = (currentTime - downloadItem.dataset.previousTime) / 1000;

			if (typeof downloadItem.dataset.previousBytes !== undefined)
				var downloadSpeed = (download.currentBytes - downloadItem.dataset.previousBytes) / elapsedTime;

			const estimatedTimeRemaining = remainingBytes / downloadSpeed;

			if (!isNaN(estimatedTimeRemaining)) {
				if (download.totalBytes !== 0) {
					if (formatETA(estimatedTimeRemaining))
						document.querySelector(`.item[id="${download.target.path}"] .eta`).textContent = gkDownloadManagerBundle.GetStringFromName("timeLeft").replace("%s", formatETA(estimatedTimeRemaining));
					else
						document.querySelector(`.item[id="${download.target.path}"] .eta`).textContent = "";
				}
				else {
				document.querySelector(`.item[id="${download.target.path}"] .eta`).textContent = "";
				}

				if (download.launchWhenSucceeded) {
					if (download.totalBytes !== 0) {
						if (formatETA(estimatedTimeRemaining))
							document.querySelector(`.item[id="${download.target.path}"] .eta`).textContent = gkDownloadManagerBundle.GetStringFromName("openingInTime").replace("%s", formatETA(estimatedTimeRemaining));
						else
							document.querySelector(`.item[id="${download.target.path}"] .eta`).textContent = "";
					}
					else {
						document.querySelector(`.item[id="${download.target.path}"] .eta`).textContent = gkDownloadManagerBundle.GetStringFromName("openingWhenComplete");
					}
						
				}
			}

			// Update previous values for the next calculation
			downloadItem.dataset.previousBytes = download.currentBytes;
			downloadItem.dataset.previousTime = currentTime;

			if (download.hasProgress) {
				downloadItem.dataset.state = "progress";

				if (!download.canceled || !download.error)	
					downloadItem.style.setProperty('--gkdownload-progress', `${download.progress}%`);
			}

			if (download.succeeded) {
				downloadItem.dataset.state = "done";
			} else if (download.canceled) {
				downloadItem.dataset.state = "canceled";

				if (download.hasPartialData)
					document.querySelector(`.item[id="${download.target.path}"] .size`).textContent = DownloadsCommon.strings.statePaused;
				else
					document.querySelector(`.item[id="${download.target.path}"] .size`).textContent = DownloadsCommon.strings.stateCanceled;		

				document.querySelector(`.item[id="${download.target.path}"] .eta`).textContent = "";
			} else if (download.error) {
				downloadItem.dataset.state = "error";

				if (download.error.localizedReason)
					document.querySelector(`.item[id="${download.target.path}"] .size`).textContent = `${DownloadsCommon.strings.stateFailed} - ${download.error.localizedReason}`;
				else
					document.querySelector(`.item[id="${download.target.path}"] .size`).textContent = `${DownloadsCommon.strings.stateFailed}`;

				document.querySelector(`.item[id="${download.target.path}"] .eta`).textContent = "";
			}
		}
		
		function formatETA(seconds) {
			seconds = parseInt(seconds);

			if (isNaN(seconds))
				seconds = 0;

			const timeUnits = [
				{ unit: "year",		seconds: 31536000 },
				{ unit: "month",	seconds: 2592000 },
				{ unit: "day",		seconds: 86400 },
				{ unit: "hour",		seconds: 3600 },
				{ unit: "minute",	seconds: 60 },
				{ unit: "second",	seconds: 1 }
			];
			
			for (const { unit, seconds: unitSeconds } of timeUnits) {
				var count = Math.floor(seconds / unitSeconds);

				if (count > 0) {
					if (count > 1) {
						if (unit)
							return `${count} ${gkDownloadManagerBundle.GetStringFromName(unit + "s")}`;
						else
							return;
					} else {
						if (unit)
							return `${count} ${gkDownloadManagerBundle.GetStringFromName(unit)}`;
						else
							return;
					}
				}
			}
		}
	}

	static checkItemBounds() {
		const parent = document.getElementById("gkDownloadList");
		const children = document.querySelectorAll(`#gkDownloadList > .item`);

		children.forEach(child => {	
			const childRect = child.getBoundingClientRect();
			const parentRect = parent.getBoundingClientRect();
			
			if (childRect.right > parentRect.width) {
				child.style.opacity = '0';
				child.style.pointerEvents = 'none';
			} else {
				child.style.opacity = '1';
				child.style.pointerEvents = 'auto';
			}
		});
	}
}

_ucUtils.windowIsReady(window).then(() => {
	gkDownloadManager.createShelf();
});