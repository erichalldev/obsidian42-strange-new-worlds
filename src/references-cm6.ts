import {WidgetType, EditorView, Decoration} from "@codemirror/view";
import {ViewUpdate, ViewPlugin, DecorationSet} from "@codemirror/view";
import {RangeSetBuilder} from "@codemirror/rangeset";
import {App, editorViewField, MarkdownView, Notice} from "obsidian";
import {getCurrentPage } from "src/indexer";
import htmlReferenceElement from "./htmlDecorations";
import ThePlugin from "./main";

class InlineReferenceWidget extends WidgetType {
    referenceCount: number;
    referenceType: string;
    key: string;    //a unique identifer for the reference
    thePlugin: ThePlugin;

    constructor(refCount: number, cssclass: string, key:string, thePlugin: ThePlugin) {
        super();
        this.referenceCount = refCount;
        this.referenceType = cssclass;
        this.key = key;
        this.thePlugin = thePlugin;
    }

    // eq(other: InlineReferenceWidget) { 
    //     console.log("other", other.referenceCount, this.referenceCount)
    //     return other.referenceCount == this.referenceCount; 
    // }

    toDOM() {
        return htmlReferenceElement(this.thePlugin, this.referenceCount, this.referenceType, this.key);
    }

    destroy() {}

    ignoreEvent() { return false }
}

interface referenceLocation {
    type: "block" | "heading" | "embed" | "link";
    pos: number;
    count: number;
    key: string; //identifier for the reference
}

function matchAll(source: string, find: string) {
    const result = [];
    for(let i=0;i<source.length; ++i) 
      if (source.substring(i, i + find.length) == find) 
        result.push(i);
    return result;
  }

 
function calclulateInlineReferences(view: EditorView, theApp: App, mdView: MarkdownView, thePlugin: ThePlugin) {
    const rangeSetBuilder = new RangeSetBuilder<Decoration>();
    if(mdView?.file===undefined) return rangeSetBuilder.finish();

    const referenceLocations: referenceLocation[] = [];

    // const allLinks: Link[] = theApp.fileManager.getAllLinkResolutions();
    //const incomingFiles = allLinks.filter(f=>f.resolvedFile.path===currentViewDocumentFilePath);
    // console.log("incomingFiles", incomingFiles)

    const transformedCache = getCurrentPage({ file: mdView.file, app });
    
    const viewPort = view.viewport; 

    // walk through the elements of the document (blocks, headings, embeds, links) and test each line to see if it contains
    // something that should be featured in the editor

    let currentLocationInDocument = 0; 

    const processBlocks = (t:string)=> {
        if(viewPort.to>=currentLocationInDocument && viewPort.from<=currentLocationInDocument) {
            if(transformedCache.blocks) 
                for (const value of transformedCache.blocks) 
                    if(value.references.length>0 && t.endsWith(` ^${value.key}`)) {
                        referenceLocations.push({type:"block", pos: value.pos.end.offset, count: value.references.length, key: value.key});     
                        break;
                    }
                    
            if(transformedCache.headings) 
                for (const value of transformedCache.headings) 
                    if(value.references.length>0 && t===value.original) {
                        referenceLocations.push({type:"heading", pos: currentLocationInDocument + t.length, count: value.references.length, key: value.original});   
                        break;
                    }

            if(transformedCache.embeds)
                for (const value of transformedCache.embedsWithDuplicates) 
                    if(value.references.length>0) 
                        matchAll(t, value.key).forEach(match=>
                            referenceLocations.push({ type:"embed", count: value.references.length,
                                                      pos: currentLocationInDocument + match + value.key.length +2, key: value.key}));

            if(transformedCache.linksWithoutDuplicates)
                for (const value of transformedCache.linksWithoutDuplicates) 
                    if(value.references.length>0) 
                        matchAll(t, value.key).forEach(match=>
                            referenceLocations.push({ type:"link", count: value.references.length,
                                                        pos: currentLocationInDocument + match + value.key.length, key: value.key}));
        }
    }

    if(view.state.doc.children) {
        view.state.doc.children.forEach((child)=>{
            child.text.forEach((t:string)=> {
                processBlocks(t);
                currentLocationInDocument += t.length + 1;
            });
        });
    } else {
        view.state.doc.text.forEach((t:string)=> {
            processBlocks(t);
            currentLocationInDocument += t.length + 1;
        });
    }
    
    // console.log(referenceLocations)
    referenceLocations.sort((a,b)=>a.pos-b.pos).forEach((r)=>{
        rangeSetBuilder.add(
            r.pos, r.pos,
            Decoration.widget({widget: new InlineReferenceWidget(r.count, r.type, r.key, this.thePlugin), side: 1})
        );        
    });

    return rangeSetBuilder.finish(); 
}

const InlineReferenceExtension = ViewPlugin.fromClass(class {
    app: App;
    mdView: MarkdownView;
    decorations : DecorationSet;
    thePlugin: ThePlugin;

    constructor(view: EditorView, plugin: ThePlugin) { 
        this.mdView = view.state.field(editorViewField);
        this.app = this.mdView.app;
        this.thePlugin = plugin;
        this.decorations = calclulateInlineReferences(view, this.app, this.mdView, this.thePlugin)
    }

    update(update : ViewUpdate) { 
        // if (update.docChanged || update.viewportChanged) 
            this.decorations = calclulateInlineReferences(update.view, this.app, this.mdView,  this.thePlugin)
    }
}, {
    decorations: v => v.decorations,
    eventHandlers: {
        mousedown: (e, view) => {
            const target = (e.target as HTMLElement).closest(".snw-inline-ref");
            if(target) {
                console.log("click", target)
                new Notice("click   ")
            }   
        }
    }
})

export default InlineReferenceExtension;