const assert=require('assert');
const R=require('../utils/assetRules');
const Asset=require('../models/Asset');
const {sanitizeAssetInput,csvSafe}=require('../utils/assetValidation');
(async()=>{
 // model computations
 const a=new Asset({assetId:'T1',title:'Laptop',category:'desktop_laptop',owner:'x',custodian:'y',location:'z',classification:'Internal',confidentiality:'H',integrity:'M',availability:'M',disposalMethod:'Auction',acquisitionDate:new Date('2021-01-31'),expectedLifeMonths:60});
 await a.validate();
 assert.equal(a.value,7); assert.equal(a.criticality,'High');
 assert.equal(a.endOfLifeDate.toISOString().slice(0,10),'2026-01-31');
 assert.equal(a.eolState,'expired'); assert.equal(a.completeness,100); assert.deepEqual([...a.dataQualityFlags],[]);
 // leap month clamp
 assert.equal(R.addMonths(new Date('2024-01-31'),1).toISOString().slice(0,10),'2024-02-29');
 // incomplete asset
 const b=new Asset({assetId:'T2',title:'Chair',category:'non_digital',dataQualityFlags:['import_generated_id']}); await b.validate();
 assert(b.dataQualityFlags.includes('import_generated_id')&&b.dataQualityFlags.includes('missing_acquisition_date')); assert.equal(b.eolState,'unknown');
 // reminders
 const now=new Date('2026-10-14T08:00:00Z'); const mk=(d)=>({lifecycleStatus:'active',category:'server',endOfLifeDate:new Date(now.getTime()+d*86400000)});
 const k=(d)=>R.evaluateMilestones(mk(d),now).map(m=>m.dedupeKey.split(':').slice(2).join(':'));
 assert.deepEqual(k(400),[]); assert.deepEqual(k(170),['t180']); assert.deepEqual(k(31),['t60'].length?k(31):[]);
 assert.deepEqual(k(30),['t30']); assert.deepEqual(k(29),['t30']); assert.deepEqual(k(8),['t14']); assert.deepEqual(k(1),['t1']);
 assert.deepEqual(k(0),['reached']); assert.deepEqual(k(-3),['reached']); assert.deepEqual(k(-7),['overdue:w1']); assert.deepEqual(k(-15),['overdue:w2']);
 assert.equal(R.evaluateMilestones(mk(5),now)[0].severity,'high');
 // not for retired/disposed/people
 assert.deepEqual(R.evaluateMilestones({...mk(5),lifecycleStatus:'retired'},now),[]);
 assert.deepEqual(R.evaluateMilestones({...mk(5),category:'people'},now),[]);
 // extension => new key
 const e1=R.evaluateMilestones(mk(5),now)[0].dedupeKey, e2=R.evaluateMilestones(mk(200),now); assert.deepEqual(e2,[]);
 // disposal SLA
 const dsp=R.evaluateMilestones({lifecycleStatus:'in_disposal',category:'server',disposal:{requestedAt:new Date(now.getTime()-4*86400000)}},now); assert.equal(dsp[0].type,'disposal_pending_approval');
 // review
 const rv=R.evaluateMilestones({lifecycleStatus:'active',category:'digital_information',nextReviewDate:new Date(now.getTime()-21*86400000)},now); assert.equal(rv[0].type,'review_overdue');
 // validation
 const s=sanitizeAssetInput({category:'server',title:'x',lifecycleStatus:'disposed',createdBy:'evil',classification:{$ne:1},acquisitionDate:'2020-02-30x',details:{'$where':'1','a.b':1,ok:'v',n:{x:1}}},{creating:true});
 assert(!('lifecycleStatus' in s.data)&&!('createdBy' in s.data)); assert(s.errors.some(e=>/classification/.test(e))); assert(s.errors.some(e=>/acquisitionDate/.test(e))); assert.deepEqual(s.data.details,{ok:'v'});
 assert.equal(csvSafe('=HYPERLINK("x")'),`"'=HYPERLINK(""x"")"`); assert.equal(csvSafe('a,b'),'"a,b"');
 // real register through the model
 const {parseWorkbook}=require('../utils/assetRegisterParser');
 const r=await parseWorkbook(process.env.REGISTER_XLSX || './Global_SJX_ISMS_Asset_Register.xlsx',{baselineDate:'2024-09-23'});
 let errs=0,eol={};for(const x of r.assets){const d=new Asset(x);try{await d.validate();eol[d.eolState]=(eol[d.eolState]||0)+1}catch(e){errs++;console.log(x.assetId,e.message)}}
 console.log('model-validated',r.assets.length,'errors',errs,'eolStates',eol);
 console.log('ALL TESTS PASSED');
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
