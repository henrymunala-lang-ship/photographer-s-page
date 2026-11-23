"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Profile={id:string;slug:string;name:string;email:string;bio:string;location:string;categories:string[];profileImageUrl:string;heroImageUrl:string;status:string;publishState:string};
type Draft={publicName:string;bio:string;location:string;categories:string};
type Photo={id:string;title:string;caption:string;imageUrl:string;altText:string;category:string;sortOrder:number};
type Stage={kind:"profile"|"hero"|"gallery"|"gallery-edit";file:File;url:string;x:number;y:number};
type PhotoEdit={id:string;title:string;caption:string;category:string;altText:string};
const blank:Draft={publicName:"",bio:"",location:"",categories:""};

function makeCrop(file:File,aspect:number,x:number,y:number):Promise<File>{
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
   try{
    const sourceAspect=img.naturalWidth/img.naturalHeight;
    let w=img.naturalWidth,h=img.naturalHeight;
    if(sourceAspect>aspect)w=h*aspect;else h=w/aspect;
    const canvas=document.createElement("canvas"),width=aspect===1?1200:1600;
    canvas.width=width;canvas.height=Math.round(width/aspect);
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("Image preview is not supported by this browser.");
    ctx.drawImage(img,(img.naturalWidth-w)*x,(img.naturalHeight-h)*y,w,h,0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{URL.revokeObjectURL(url);if(!blob){reject(new Error("The image could not be prepared."));return;}resolve(new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"}));},"image/jpeg",0.9);
   }catch(e){URL.revokeObjectURL(url);reject(e);}
  };
  img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("This image could not be previewed. Choose a JPG, PNG or WebP photo."));};
  img.src=url;
 });
}

export default function PhotographerPortal(){
 const [profile,setProfile]=useState<Profile|null>(null),[draft,setDraft]=useState<Draft>(blank),[gallery,setGallery]=useState<Photo[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[busy,setBusy]=useState(false),[stageBusy,setStageBusy]=useState(false);
 const [stage,setStage]=useState<Stage|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[galleryMessage,setGalleryMessage]=useState("");
 const [file,setFile]=useState<File|null>(null),[fileUrl,setFileUrl]=useState(""),[title,setTitle]=useState(""),[caption,setCaption]=useState(""),[category,setCategory]=useState("");
 const [editing,setEditing]=useState<PhotoEdit|null>(null),[editFile,setEditFile]=useState<File|null>(null),[editMessage,setEditMessage]=useState("");

 async function loadGallery(){
  const r=await fetch("/api/photographer/gallery",{cache:"no-store"}),d=await r.json();
  if(!r.ok)throw new Error(d.error||"Portfolio gallery could not be loaded.");
  setGallery(Array.isArray(d.gallery)?d.gallery:[]);
 }
 async function load(){
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/photographer/profile",{cache:"no-store"}),d=await r.json();
   if(!r.ok)throw new Error(d.error||"Your profile could not be loaded.");
   const p=d.photographer as Profile;setProfile(p);setDraft({publicName:p.name,bio:p.bio,location:p.location,categories:p.categories.join(", ")});
   await loadGallery();
  }catch(e){setError(e instanceof Error?e.message:"Your workspace could not be loaded.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 useEffect(()=>()=>{if(stage?.url)URL.revokeObjectURL(stage.url);},[stage?.url]);
 useEffect(()=>()=>{if(fileUrl)URL.revokeObjectURL(fileUrl);},[fileUrl]);
 function choose(kind:Stage["kind"],f?:File){
  if(!f)return;
  if(f.size<1||f.size>8*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type)){setError("Choose a JPG, PNG or WebP image up to 8 MB.");return;}
  setError("");setMessage("");setStage({kind,file:f,url:URL.createObjectURL(f),x:.5,y:.5});
 }
 async function confirmStage(){
  if(!stage||!profile||stageBusy)return;
  setStageBusy(true);setError("");setMessage("");
  try{
   const aspect=stage.kind==="profile"?1:stage.kind==="hero"?16/9:4/3;
   const prepared=await makeCrop(stage.file,aspect,stage.x,stage.y),form=new FormData();
   form.set("image",prepared);form.set("kind",stage.kind);
   const galleryMode=stage.kind==="gallery"||stage.kind==="gallery-edit",editingMode=stage.kind==="gallery-edit",url=galleryMode?"/api/photographer/gallery":"/api/photographer/profile/images";
   if(stage.kind==="gallery"){form.set("title",title.trim());form.set("caption",caption.trim());form.set("altText",title.trim()||"Portfolio photograph");form.set("category",category.trim());}
   if(editingMode&&editing){form.set("photoId",editing.id);form.set("title",editing.title);form.set("caption",editing.caption);form.set("altText",editing.altText);form.set("category",editing.category);}
   const r=await fetch(url,{method:editingMode?"PUT":"POST",body:form}),d=await r.json();
   if(!r.ok)throw new Error(d.error||"Image could not be saved.");
   if(galleryMode){
    if(editingMode){setGallery(v=>v.map(p=>p.id===d.photo.id?d.photo:p));setEditing(null);setEditFile(null);setEditMessage("Portfolio photograph updated and remains visible on your public profile.");}
    else{setGallery(v=>[...v,d.photo].sort((a,b)=>a.sortOrder-b.sortOrder));setTitle("");setCaption("");setCategory("");setGalleryMessage("Photograph added and now visible on your public profile.");
    if(fileUrl)URL.revokeObjectURL(fileUrl);setFileUrl("");setFile(null);
   }}else{
    const key=stage.kind==="profile"?"profileImageUrl":"heroImageUrl";
    setProfile(v=>v?{...v,[key]:d.url}:v);setMessage(stage.kind==="profile"?"Your new profile picture is live.":"Your new cover photo is live.");
   }
   setStage(null);
  }catch(e){setError(e instanceof Error?e.message:"Image could not be saved.");}
  finally{setStageBusy(false);}
 }
 async function saveDetails(e:React.FormEvent){
  e.preventDefault();if(!profile||saving)return;setSaving(true);setError("");setMessage("");
  try{
   const payload={...draft,categories:draft.categories.split(",").map(v=>v.trim()).filter(Boolean),profileImageUrl:profile.profileImageUrl,heroImageUrl:profile.heroImageUrl};
   const r=await fetch("/api/photographer/profile",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}),d=await r.json();
   if(!r.ok)throw new Error(d.error||"Profile details could not be saved.");
   setProfile(v=>v?{...v,slug:d.slug||v.slug,name:draft.publicName,bio:draft.bio,location:draft.location,categories:payload.categories}:v);
   setMessage(d.unchanged?"Your profile is already up to date.":"Your profile details have been saved.");
  }catch(e){setError(e instanceof Error?e.message:"Profile details could not be saved.");}
  finally{setSaving(false);}
 }
 function selectGalleryFile(f?:File){
  if(fileUrl)URL.revokeObjectURL(fileUrl);setFile(null);setFileUrl("");
  if(!f)return;
  if(f.size<1||f.size>8*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type)){setGalleryMessage("Choose a JPG, PNG or WebP image up to 8 MB.");return;}
  setFile(f);setFileUrl(URL.createObjectURL(f));setGalleryMessage("");
 }
 async function savePhotoEdit(e:React.FormEvent){
  e.preventDefault();if(!editing||busy)return;setEditMessage("");
  if(editFile){choose("gallery-edit",editFile);return;}
  setBusy(true);try{const form=new FormData();form.set("photoId",editing.id);form.set("title",editing.title.trim());form.set("caption",editing.caption.trim());form.set("altText",editing.altText.trim());form.set("category",editing.category.trim());const r=await fetch("/api/photographer/gallery",{method:"PUT",body:form}),d=await r.json();if(!r.ok)throw new Error(d.error||"Portfolio edit could not be saved.");setGallery(v=>v.map(p=>p.id===d.photo.id?d.photo:p));setEditing(null);setEditFile(null);setEditMessage("Portfolio details updated.");}catch(e){setEditMessage(e instanceof Error?e.message:"Portfolio edit could not be saved.");}finally{setBusy(false);}
 }
 async function removePhoto(id:string){
  if(!window.confirm("Remove this photograph from your public portfolio? The stored original will be retained."))return;
  setBusy(true);setGalleryMessage("");
  try{const r=await fetch("/api/photographer/gallery",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({photoId:id})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Photograph could not be removed.");setGallery(v=>v.filter(p=>p.id!==id));setGalleryMessage("Photograph removed from your public portfolio.");}
  catch(e){setGalleryMessage(e instanceof Error?e.message:"Photograph could not be removed.");}finally{setBusy(false);}
 }
 async function movePhoto(index:number,step:-1|1){
  const target=index+step;if(target<0||target>=gallery.length||busy)return;
  const next=[...gallery];[next[index],next[target]]=[next[target],next[index]];
  const reordered=next.map((p,i)=>({...p,sortOrder:i+1}));setBusy(true);setGalleryMessage("");
  try{
   for(const p of [reordered[index],reordered[target]]){
    const r=await fetch("/api/photographer/gallery",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({photoId:p.id,sortOrder:p.sortOrder})}),d=await r.json();
    if(!r.ok)throw new Error(d.error||"Gallery order could not be saved.");
   }
   setGallery(reordered);setGalleryMessage("Portfolio order updated.");
  }catch(e){setGalleryMessage(e instanceof Error?e.message:"Gallery order could not be saved.");try{await loadGallery();}catch{}}
  finally{setBusy(false);}
 }
 async function logout(){await fetch("/api/photographer/auth/logout",{method:"POST"});window.location.href="/photographer/login";}
 return <main style={{minHeight:"100vh",background:"#f5f2ec",padding:"34px 18px 70px",color:"#25231f"}}>
  <div style={{maxWidth:980,margin:"0 auto"}}>
   <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:38}}>
    <Link href="/" style={{color:"inherit",textDecoration:"none",fontWeight:800,letterSpacing:".12em"}}>LENS & LIGHT</Link>
    <div style={{display:"flex",gap:12,alignItems:"center"}}>{profile&&<Link href={"/photographers/"+encodeURIComponent(profile.slug)} style={{color:"#665e51"}}>Public profile</Link>}<button onClick={logout} style={secondary}>Sign out</button></div>
   </header>
   <p style={kicker}>PHOTOGRAPHER WORKSPACE</p><h1 style={headline}>Your profile, <em>your story.</em></h1>
   <p style={intro}>Manage your pictures and portfolio independently. Preview every image before saving it to your public profile.</p>
   {loading?<p>Loading your photographer workspace…</p>:!profile?<section style={panel}><p role="alert">{error}</p><Link href="/photographer/login">Return to sign in</Link></section>:<>
    <div style={{display:"flex",gap:10,margin:"22px 0",alignItems:"center",flexWrap:"wrap"}}><span style={pill}>{profile.status}</span><span style={pill}>{profile.publishState}</span><span style={note}>{profile.email}</span></div>
    {(error||message)&&<p role={error?"alert":"status"} style={{...notice,background:error?"#fff0ed":"#eef4eb",color:error?"#8d281d":"#31502c"}}>{error||message}</p>}
    <section style={panel}>
     <p style={kicker}>01 — PROFILE DETAILS</p><h2 style={sectionTitle}>Your public information</h2>
     <form onSubmit={saveDetails}>
      <div style={grid}>
       <label style={label}>Public name<input style={input} value={draft.publicName} onChange={e=>setDraft(v=>({...v,publicName:e.target.value}))} maxLength={120} required/></label>
       <label style={label}>Primary location<input style={input} value={draft.location} onChange={e=>setDraft(v=>({...v,location:e.target.value}))} maxLength={160}/></label>
       <label style={{...label,gridColumn:"1 / -1"}}>Biography<textarea style={{...input,minHeight:100}} value={draft.bio} onChange={e=>setDraft(v=>({...v,bio:e.target.value}))} maxLength={5000}/></label>
       <label style={{...label,gridColumn:"1 / -1"}}>Photography categories<input style={input} value={draft.categories} onChange={e=>setDraft(v=>({...v,categories:e.target.value}))} placeholder="Portrait, Wedding, Events"/></label>
      </div>
      <button disabled={saving} style={{...primary,marginTop:18}}>{saving?"Saving…":"Save profile details"}</button>
      <p style={note}>Approval, publication and membership settings remain under Lens & Light administration.</p>
     </form>
    </section>
    <section style={{...panel,marginTop:18}}>
     <p style={kicker}>02 — PROFILE PHOTOGRAPHS</p><h2 style={sectionTitle}>Update your pictures</h2>
     <p style={intro}>Choose a new photo, adjust its position and preview the crop. Your current picture stays public until you confirm the new one.</p>
     <div style={grid}>
      <div><h3 style={subTitle}>Profile picture · Square</h3>{profile.profileImageUrl?<img src={profile.profileImageUrl} alt="Current profile picture" style={{width:140,height:140,borderRadius:"50%",objectFit:"cover",marginBottom:12}}/>:<div style={empty}>No profile picture yet</div>}<label style={label}>Choose a new profile picture<input style={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{choose("profile",e.target.files?.[0]);e.currentTarget.value="";}}/></label></div>
      <div><h3 style={subTitle}>Cover photo · 16:9</h3>{profile.heroImageUrl?<img src={profile.heroImageUrl} alt="Current cover photo" style={{width:"100%",aspectRatio:"16 / 9",objectFit:"cover",marginBottom:12}}/>:<div style={{...empty,aspectRatio:"16 / 9"}}>No cover photo yet</div>}<label style={label}>Choose a new cover photo<input style={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{choose("hero",e.target.files?.[0]);e.currentTarget.value="";}}/></label></div>
     </div>
     <p style={note}>JPG, PNG or WebP · Maximum 8 MB. The new photo is uploaded only after you confirm the crop.</p>
    </section>
    <section style={{...panel,marginTop:18}}>
     <p style={kicker}>03 — MY PORTFOLIO</p><h2 style={sectionTitle}>Build your gallery</h2>
     <p style={intro}>Add examples of your work. Each photograph you save appears immediately on your published public profile.</p>
     <div style={grid}>
      <label style={label}>Photo title<input style={input} value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="e.g. Golden-hour portrait"/></label>
      <label style={label}>Category<input style={input} value={category} onChange={e=>setCategory(e.target.value)} maxLength={80} placeholder="Portrait, Wedding, Nature"/></label>
      <label style={{...label,gridColumn:"1 / -1"}}>Short caption<textarea style={{...input,minHeight:70}} value={caption} onChange={e=>setCaption(e.target.value)} maxLength={500} placeholder="A little context about this photograph (optional)"/></label>
     </div>
     <label style={{...label,marginTop:14}}>Choose a portfolio photograph<input style={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{selectGalleryFile(e.target.files?.[0]);e.currentTarget.value="";}}/></label>
     {fileUrl&&<div style={{maxWidth:520,marginTop:14}}><img src={fileUrl} alt="Selected portfolio image" style={{width:"100%",aspectRatio:"4 / 3",objectFit:"contain",background:"#eee9df"}}/><div style={{display:"flex",gap:10,marginTop:10}}><button type="button" style={primary} onClick={()=>file&&choose("gallery",file)}>Preview crop and continue</button><button type="button" style={secondary} onClick={()=>{URL.revokeObjectURL(fileUrl);setFileUrl("");setFile(null);}}>Cancel</button></div></div>}
     {galleryMessage&&<p role="status" style={note}>{galleryMessage}</p>}
     <h3 style={{...subTitle,marginTop:28}}>Your published portfolio ({gallery.length})</h3>
     {gallery.length===0?<div style={emptyGallery}>Your portfolio is ready for its first photograph. Choose an image above to get started.</div>:<div style={galleryGrid}>{gallery.map((p,i)=><article key={p.id} style={galleryCard}>
      <img src={p.imageUrl} alt={p.altText||p.title||"Portfolio photograph"} style={{width:"100%",aspectRatio:"4 / 3",objectFit:"cover"}}/>
      <div style={{padding:12}}><strong>{p.title||"Untitled photograph"}</strong>{p.category&&<p style={note}>{p.category}</p>}{p.caption&&<p style={note}>{p.caption}</p>}
       {editing?.id===p.id&&<form onSubmit={savePhotoEdit} style={{display:"grid",gap:8,marginTop:10}}><label style={label}>Title<input style={input} value={editing.title} maxLength={120} onChange={e=>setEditing(v=>v?{...v,title:e.target.value}:v)}/></label><label style={label}>Caption<textarea style={{...input,minHeight:65}} value={editing.caption} maxLength={500} onChange={e=>setEditing(v=>v?{...v,caption:e.target.value}:v)}/></label><label style={label}>Category<input style={input} value={editing.category} maxLength={80} onChange={e=>setEditing(v=>v?{...v,category:e.target.value}:v)}/></label><label style={label}>Replace image (optional)<input style={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f&&(f.size>8*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type))){setEditMessage("Choose a JPG, PNG or WebP image up to 8 MB.");}else setEditFile(f||null);e.currentTarget.value="";}}/></label><div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button type="submit" style={primary} disabled={busy}>Save changes{editFile?" and crop image":""}</button><button type="button" style={secondary} onClick={()=>{setEditing(null);setEditFile(null);}}>Cancel</button></div>{editMessage&&<p role="status" style={note}>{editMessage}</p>}</form>}<div style={{display:"flex",gap:7,marginTop:10}}><button type="button" style={small} disabled={busy} onClick={()=>{setEditing({id:p.id,title:p.title,caption:p.caption,category:p.category,altText:p.altText});setEditFile(null);setEditMessage("");}}>Edit</button><button type="button" style={small} disabled={busy||i===0} onClick={()=>void movePhoto(i,-1)} aria-label="Move up">↑</button><button type="button" style={small} disabled={busy||i===gallery.length-1} onClick={()=>void movePhoto(i,1)} aria-label="Move down">↓</button><button type="button" style={remove} disabled={busy} onClick={()=>void removePhoto(p.id)}>Remove</button></div>
      </div>
     </article>)}</div>}
    </section>
   </>}
   <footer style={{...note,marginTop:28}}>Removing a photograph hides it from your public portfolio but retains the stored original. <Link href="/" style={{color:"inherit"}}>Return to Lens & Light</Link></footer>
  </div>
  {stage&&<div role="dialog" aria-modal="true" aria-labelledby="crop-heading" style={backdrop}><section style={modal}>
   <p style={kicker}>IMAGE PREVIEW</p><h2 id="crop-heading" style={sectionTitle}>{stage.kind==="profile"?"Profile picture crop":stage.kind==="hero"?"Cover photo crop":"Portfolio photograph crop"}</h2>
   <p style={intro}>Move the image horizontally and vertically until the important subject sits inside the frame. This is the exact crop that will be saved.</p>
   <div style={{width:"100%",maxWidth:stage.kind==="profile"?330:580,aspectRatio:stage.kind==="profile"?"1 / 1":stage.kind==="hero"?"16 / 9":"4 / 3",overflow:"hidden",background:"#e8e3da",margin:"16px auto"}}><img src={stage.url} alt="Crop preview" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:(stage.x*100)+"% "+(stage.y*100)+"%"}}/></div>
   <label style={label}>Horizontal position<input type="range" min="0" max="1" step=".01" value={stage.x} onChange={e=>setStage(v=>v?{...v,x:Number(e.target.value)}:v)}/></label>
   <label style={{...label,marginTop:12}}>Vertical position<input type="range" min="0" max="1" step=".01" value={stage.y} onChange={e=>setStage(v=>v?{...v,y:Number(e.target.value)}:v)}/></label>
   <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:22,flexWrap:"wrap"}}><button type="button" style={secondary} disabled={stageBusy} onClick={()=>setStage(null)}>Cancel</button><button type="button" style={primary} disabled={stageBusy} onClick={()=>void confirmStage()}>{stageBusy?"Saving image…":stage.kind==="gallery"?"Add to portfolio":"Save new picture"}</button></div>
  </section></div>}
 </main>;
}

const kicker:React.CSSProperties={fontSize:11,letterSpacing:".18em",fontWeight:700,color:"#777064"};
const headline:React.CSSProperties={fontFamily:"Georgia,serif",fontWeight:400,fontSize:"clamp(34px,6vw,52px)",margin:"12px 0"};
const panel:React.CSSProperties={background:"#fffdf9",border:"1px solid #dedbd3",padding:"clamp(16px,4vw,28px)",borderRadius:8};
const sectionTitle:React.CSSProperties={fontFamily:"Georgia,serif",fontWeight:400,fontSize:"clamp(24px,4vw,34px)",margin:"8px 0 12px"};
const intro:React.CSSProperties={maxWidth:720,color:"#6d685f",fontSize:14,lineHeight:1.7};
const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16};
const label:React.CSSProperties={display:"grid",gap:7,fontSize:12,fontWeight:700};
const input:React.CSSProperties={width:"100%",boxSizing:"border-box",padding:11,border:"1px solid #d4cec3",background:"#fff",font:"inherit",fontWeight:400};
const fileInput:React.CSSProperties={width:"100%",boxSizing:"border-box",padding:9,border:"1px solid #d4cec3",background:"#fff",fontSize:12,fontWeight:400};
const primary:React.CSSProperties={padding:"12px 18px",background:"#292821",color:"#fff",border:0,cursor:"pointer",fontSize:13};
const secondary:React.CSSProperties={padding:"9px 13px",background:"transparent",border:"1px solid #cfc7b8",cursor:"pointer",fontSize:13,color:"#292821"};
const small:React.CSSProperties={padding:"5px 10px",background:"#f5f2ec",border:"1px solid #d4cec3",cursor:"pointer"};
const remove:React.CSSProperties={padding:"5px 10px",background:"#fff0ed",border:"1px solid #dfb6ae",cursor:"pointer",color:"#8d281d",fontSize:12};
const note:React.CSSProperties={fontSize:11,color:"#777064",lineHeight:1.6};
const pill:React.CSSProperties={fontSize:11,letterSpacing:".06em",padding:"6px 10px",border:"1px solid #d6d0c4",background:"#fffdf9"};
const subTitle:React.CSSProperties={fontSize:16,fontWeight:600,margin:"8px 0 12px"};
const empty:React.CSSProperties={display:"grid",placeItems:"center",background:"#eee9df",color:"#777064",padding:18,marginBottom:12,minHeight:100,fontSize:12};
const emptyGallery:React.CSSProperties={padding:24,background:"#f5f2ec",border:"1px dashed #cfc7b8",color:"#6d685f",fontSize:13,lineHeight:1.6};
const galleryGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:14,marginTop:16};
const galleryCard:React.CSSProperties={border:"1px solid #dedbd3",background:"#fff"};
const notice:React.CSSProperties={padding:14,margin:"16px 0",border:"1px solid #9aaf91"};
const backdrop:React.CSSProperties={position:"fixed",inset:0,zIndex:1000,background:"rgba(25,23,19,.72)",display:"grid",placeItems:"center",padding:16};
const modal:React.CSSProperties={width:"min(100%,720px)",maxHeight:"92vh",overflowY:"auto",background:"#fffdf9",padding:"clamp(18px,4vw,30px)",borderRadius:8};
