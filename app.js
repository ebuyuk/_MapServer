
import fabric from 'fabric';
import fs     from 'fs';
import convert from 'xml-js';
import { jsPDF } from "jspdf";
import puppeteer from "puppeteer";
import * as pathPlugin from 'path';
import express from "express"; 
var path;
process.argv.forEach((value, index) => {
	if (index == 2) {
		path = value;
	}
});
var browser = null 
var app = express();
app.get('/export', async function (req, res) {
	browser = await puppeteer.launch();
	let files = req.query.files;
	console.log(files);
	try {
		let filesArray = files.split(',');
		var exportFiles = [];
		for (let file of filesArray) {
			let exportedFile = await exportDocument(file);
			exportFiles.push(exportedFile);
		}
		await browser.close();
		res.send(exportFiles);
	} catch (err) {
		console.error(err);
	}
});
let server = app.listen(9090, function() {
    console.log('Server is listening on port 9090')
});



var scope = {
	items               : [],
	canvasData          : [],
	formItems           : [],
	images              : [],
	nextExists          : false,
	previousExists      : false,
	plainDrawingObjects : [],
	maxId               : 0,
	canvas              : null,
	brushSize           : "1",
	brushColor          : '#000000',
	isDrawingMode       : true,
	backgroundImage     : null,
	previousPageButton  : null,
	nextPageButton      : null,
	boardContainer      : null,
	isHeighlight        : false,
	widthConstant       : 215.9,
	heightConstant      : 279.4,
	baseScale           : 1,
	windowHeight        : 0,
	windowWidth         : 0,
	activeWindow        : null,
};


async function exportDocument (path) {
	const data = fs.readFileSync(path, "utf8");
	const filename = pathPlugin.parse(path).name;
	var result = convert.xml2json(data, {compact: true, spaces: 4});
	var responseObject = JSON.parse(result).document;
	
	var doc = new jsPDF({unit: 'px',format: [Number(responseObject.page[0]._attributes.width),Number(responseObject.page[0]._attributes.height)]});
	var wWidth = doc.internal.pageSize.getWidth();
	var wHeight = doc.internal.pageSize.getHeight();
	var widthMultiplier  = Number((Number(wWidth)  / scope.widthConstant).toFixed(3));
	var heightMultiplier = Number((Number(wHeight) / scope.heightConstant).toFixed(3));
	scope.baseScale     = widthMultiplier > heightMultiplier ? heightMultiplier : widthMultiplier;
	scope.windowHeight  = scope.heightConstant * scope.baseScale;
	scope.windowWidth   = scope.widthConstant * scope.baseScale;
	scope.leftPadding   = parseInt((Number(wWidth) - scope.windowWidth)/2);
	scope.topPadding    = parseInt((Number(wHeight) - scope.windowHeight)/2);
	
	var canvasWidthMultiplier  = Number((Number(wWidth)  / 215.9).toFixed(3));
	var canvasHeightMultiplier = Number((Number(wHeight) / 279.4).toFixed(3));
	scope.canvasBaseScale     = canvasWidthMultiplier > canvasHeightMultiplier ? canvasHeightMultiplier : canvasWidthMultiplier;

	for (var i = 0; i<responseObject.image.length; i++) {
		if (i != 0 && (i+1) == Number(responseObject.image[i]._attributes.pageNumber)) {
			doc.addPage([Number(responseObject.page[i]._attributes.width),Number(responseObject.page[i]._attributes.height)], 'PORTRAIT');
		}	
		for (var j = 0; j<responseObject.image.length; j++) {
			if ((i+1) == Number(responseObject.image[j]._attributes.pageNumber)) {
				var image = doc.getImageProperties(responseObject.image[j]._text);
				var height = (doc.internal.pageSize.getHeight() * responseObject.image[j]._attributes.height.replace('%','')) / 100;
				var width = (doc.internal.pageSize.getWidth() * responseObject.image[j]._attributes.width.replace('%','')) / 100;
				doc.addImage(responseObject.image[j]._text,'JPEG', 
				Math.trunc((doc.internal.pageSize.getWidth()*responseObject.image[j]._attributes.positionX.replace('%','')) / 100), 
				Math.trunc((doc.internal.pageSize.getHeight()*responseObject.image[j]._attributes.positionY.replace('%','')) / 100), 
				width, 
				height);
			}
		}
		if (responseObject.item != undefined) {
			for (var j = 0; j<responseObject.item.length; j++) {
				if ((i+1) == responseObject.item[j]._attributes.pageNumber) {
					if (responseObject.item[j]._attributes.type == 'drawing') {
						var tempArray = JSON.parse(responseObject.item[j]._text);
						var object = {isDrawingMode:false,backgroundColor:'rgba(255, 255, 255, 0.01)',selection:false,objects:tempArray}
						var canvas = new fabric.fabric.StaticCanvas(null, { width: scope.windowWidth, height: scope.windowHeight });
						canvas.setZoom(scope.canvasBaseScale)
						var outfile = fs.createWriteStream('fabrictest'+j+'.png');
						canvas.loadFromJSON(object);
						let datay = canvas.toDataURL();
						doc.addImage(datay,'PNG',0,0,doc.internal.pageSize.getWidth(),doc.internal.pageSize.getHeight());
					} else if (responseObject.item[j]._attributes.type == 'stamp') {
						var imageData = await hybritHtml2canvas('div',responseObject.item[j],doc.internal.pageSize.getWidth(),doc.internal.pageSize.getHeight());
						var x        = Math.trunc((doc.internal.pageSize.getWidth()*responseObject.item[j]._attributes.positionX.replace('%','')) / 100);
						var y        = Math.trunc((doc.internal.pageSize.getHeight()*responseObject.item[j]._attributes.positionY.replace('%','')) / 100);
						var height   = Math.trunc((doc.internal.pageSize.getHeight()*responseObject.item[j]._attributes.height.replace('%','')) / 100);
						var width    = Math.trunc((doc.internal.pageSize.getWidth()*responseObject.item[j]._attributes.width.replace('%','')) / 100);
						doc.addImage(imageData,'WEBP',x,y,width,height);
					}
					else if (responseObject.item[j]._attributes.type == 'textarea') {
						var x        = Math.trunc((doc.internal.pageSize.getWidth()*responseObject.item[j]._attributes.positionX.replace('%','')) / 100);
						var y        = Math.trunc((doc.internal.pageSize.getHeight()*responseObject.item[j]._attributes.positionY.replace('%','')) / 100);
						var height   = Math.trunc((doc.internal.pageSize.getHeight()*responseObject.item[j]._attributes.height.replace('%','')) / 100);
						var width    = Math.trunc((doc.internal.pageSize.getWidth()*responseObject.item[j]._attributes.width.replace('%','')) / 100);
						var imageData = await hybritHtml2canvas('textarea',responseObject.item[j],(doc.internal.pageSize.getWidth() * 0.75),(doc.internal.pageSize.getHeight() * 0.75));
						doc.addImage(imageData,'WEBP',x,y,width,height);
					}
				}
			}
		}
	}
	doc.save(filename+'.pdf');
	return pathPlugin.resolve('./'+filename+'.pdf');
}

async function hybritHtml2canvas (elementType, item, width, height) {
	const page = await browser.newPage();
	await page.setViewport({
		width: 1380,
		height: 768
	});
	await page.addScriptTag({path : './html2canvas.js'});
	await page.addScriptTag({path: './jquery-3.2.1.min.js'})
	await page.evaluate(([elementType, item, width, height]) => {
		var tempElement = document.createElement(elementType);
		if (item._attributes.style){
			tempElement.style = item._attributes.style;
		}   
		var x      = Math.trunc((width * item._attributes.positionX.replace('%','')) / 100);
		var y      = Math.trunc((height * item._attributes.positionY.replace('%','')) / 100);
		var heightT = Math.trunc((height * item._attributes.height.replace('%','')) / 100);
		var widthT  = Math.trunc((width * item._attributes.width.replace('%','')) / 100);
		var fontSize = Math.trunc(height * (1.5 / 100));
		if (elementType == 'textarea'){
			tempElement.style.borderWidth = 0;
			widthT += 25;
		} else {
			tempElement.style.display = 'flex';
			tempElement.style.justifyContent = 'center';
			tempElement.style.alignItems = 'center';
		}
		tempElement.style.opacity = 1;
		tempElement.style.top = y + 'px';
		tempElement.style.left = x + 'px';
		tempElement.style.height = heightT+'px';
		tempElement.style.fontSize = '60%';
		tempElement.style.fontFamily = 'monospace';
		
		tempElement.style.width = widthT+'px';
		tempElement.style.resize = 'none';
		tempElement.id = 'exportTempElement';
		tempElement.name = 'exportTempElement';
		tempElement.style.backgroundColor='transparent';
		tempElement.innerHTML = item._text;
		document.body.style.height = heightT+'px';
		document.body.style.width = widthT+'px';
		document.body.appendChild(tempElement);
	},[elementType, item, width, height]);
	
	const screenshot = await page.evaluate(async () => {
		const canvasElement = await window['@nidi/html2canvas']($("#exportTempElement")[0], {removeContainer:true,backgroundColor:null,scale: 2});
		return canvasElement.toDataURL("image/png");
	})
	await page.close();
	return screenshot;
}
