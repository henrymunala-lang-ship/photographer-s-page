"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useFeedback } from "@/components/feedback-provider";
import { ClientEnquiryThread } from "@/components/client-enquiry-thread";
import { PageSkeleton } from "@/components/page-skeleton";

function imagePreviewCandidates(input: string): string[] {
  if (!input) return [];
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:") return [];
    if (url.hostname === "drive.google.com" || url.hostname === "drive.usercontent.google.com") {
      const fileId = url.searchParams.get("id") || url.pathname.match(/^\/file\/d\/([^/]+)/)?.[1];
      if (fileId) {
        const id = encodeURIComponent(fileId);
        return [
          `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
          `https://lh3.googleusercontent.com/d/${id}=w1200`,
          `https://drive.google.com/uc?export=view&id=${id}`,
          url.toString()
        ].filter((value, index, values) => values.indexOf(value) === index);
      }
    }
    return [url.toString()];
  } catch {
    return [];
  }
}
function imagePreviewUrl(input: string): string {
  return imagePreviewCandidates(input)[0] || "";
}
function handleImagePreviewError(event: React.SyntheticEvent<HTMLImageElement>, input: string) {
  const image = event.currentTarget;
  const candidates = imagePreviewCandidates(input);
  const current = image.src;
  const next = candidates.find((candidate, index) => index > candidates.findIndex(value => value === current));
  if (next && next !== current) image.src = next;
  else image.style.display = "none";
}

type Profile={id:string;slug:string;name:string;email:string;bio:string;location:string;categories:string[];profileImageUrl:string;heroImageUrl:string;status:string;publishState:string};
type Draft={publicName:string;bio:string;location:string;categories:string};
type Photo={id:string;title:string;caption:string;imageUrl:string;altText:string;category:string;sortOrder:number;publishState:string};
type Stage={kind:"profile"|"hero"|"gallery"|"gallery-edit";file:File;url:string;x:number;y:number};
type PhotoEdit={id:string;title:string;caption:string;category:string;altText:string};
type ClientEnquiry={enquiry_id:string;customer_name:string;customer_email:string;customer_phone:string;event_type:string;event_date:string|null;event_location:string;message:string;status:string;created_at:string};
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
 const { notify, confirm } = useFeedback();
 const [profile,setProfile]=useState<Profile|null>(null),[draft,setDraft]=useState<Draft>(blank),[gallery,setGallery]=useState<Photo[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[busy,setBusy]=useState(false),[stageBusy,setStageBusy]=useState(false);
 const [stage,setStage]=useState<Stage|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[galleryMessage,setGalleryMessage]=useState("");
 const [file,setFile]=useState<File|null>(null),[fileUrl,setFileUrl]=useState(""),[title,setTitle]=useState(""),[caption,setCaption]=useState(""),[category,setCategory]=useState("");
 const [editing,setEditing]=useState<PhotoEdit|null>(null),[editFile,setEditFile]=useState<File|null>(null),[editMessage,setEditMessage]=useState("");
 const [enquiries,setEnquiries]=useState<ClientEnquiry[]>([]),[enquiriesLoading,setEnquiriesLoading]=useState(false),[enquiriesError,setEnquiriesError]=useState(""),[enquiryBusy,setEnquiryBusy]=useState<string|null>(null);

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
 useEffect(()=>{if(!profile)return;let live=true;setEnquiriesLoading(true);setEnquiriesError("");fetch("/api/photographer/enquiries",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Enquiries could not be loaded.");return d;}).then(d=>{if(live)setEnquiries(Array.isArray(d.enquiries)?d.enquiries:[]);}).catch(e=>{if(live)setEnquiriesError(e instanceof Error?e.message:"Enquiries could not be loaded.");}).finally(()=>{if(live)setEnquiriesLoading(false);});return()=>{live=false};},[profile?.id]);
 useEffect(()=>()=>{if(stage?.url)URL.revokeObjectURL(stage.url);},[stage?.url]);
 useEffect(()=>()=>{if(fileUrl)URL.revokeObjectURL(fileUrl);},[fileUrl]);
 function choose(kind:Stage["kind"],f?:File){
  if(!f)return;
  if(f.size<1||f.size>8*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type)){notify("Choose a JPG, PNG or WebP image up to 8 MB.","error","Image not accepted");return;}
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
    if(editingMode){const replacedImage=!!editFile;setGallery(v=>v.map(p=>p.id===d.photo.id?d.photo:p));setEditing(null);setEditFile(null);setEditMessage(replacedImage?"Replacement saved to the existing gallery record and submitted for admin approval. The previous image is hidden until approval.":d.photo.publishState==="PENDING_REVIEW"?"Corrections resubmitted for admin approval.":"Portfolio details updated.");notify(replacedImage?"The replacement photo is awaiting admin approval.":d.photo.publishState==="PENDING_REVIEW"?"Your corrections have been resubmitted for review.":"Portfolio details updated.","success","Portfolio updated");}
    else{setGallery(v=>[...v,d.photo].sort((a,b)=>a.sortOrder-b.sortOrder));setTitle("");setCaption("");setCategory("");setGalleryMessage("Photograph uploaded and sent to the admin review queue. It will appear publicly after approval.");notify("Your photograph is uploaded and awaiting admin approval before it appears publicly.","success","Portfolio photo submitted");
    if(fileUrl)URL.revokeObjectURL(fileUrl);setFileUrl("");setFile(null);
   }}else{
    const key=stage.kind==="profile"?"profileImageUrl":"heroImageUrl";
    setProfile(v=>v?{...v,[key]:d.url}:v);notify(stage.kind==="profile"?"Your new profile picture has been saved.":"Your new cover photo has been saved.","success","Image updated");
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
   setMessage(d.unchanged?"Your profile is already up to date.":"Your profile details have been saved.");notify(d.unchanged?"Your profile is already up to date.":"Your profile details have been saved.","success","Profile updated");
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
  if(!await confirm({title:"Remove this portfolio photograph?",description:"The photograph will be hidden from your public portfolio. The stored original in Google Drive will be retained.",confirmLabel:"Remove photograph",danger:true}))return;
  setBusy(true);setGalleryMessage("");
  try{const r=await fetch("/api/photographer/gallery",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({photoId:id})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Photograph could not be removed.");setGallery(v=>v.filter(p=>p.id!==id));setGalleryMessage("Photograph removed from your public portfolio.");notify("The photograph has been removed from your public portfolio. Its stored original was retained.","success","Photograph removed");}
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
   setGallery(reordered);setGalleryMessage("Portfolio order updated.");notify("Your portfolio order has been updated.","success","Gallery reordered");
  }catch(e){setGalleryMessage(e instanceof Error?e.message:"Gallery order could not be saved.");try{await loadGallery();}catch{}}
  finally{setBusy(false);}
 }
 async function updateEnquiryStatus(enquiryId:string,status:string){setEnquiryBusy(enquiryId);try{const r=await fetch("/api/photographer/enquiries",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({enquiryId,status})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Enquiry status could not be updated.");setEnquiries(v=>v.map(item=>item.enquiry_id===enquiryId?{...item,status:d.enquiry.status}:item));notify("Enquiry marked as "+status.replaceAll("_"," ")+".","success","Enquiry updated");}catch(e){notify(e instanceof Error?e.message:"Enquiry status could not be updated.","error","Update failed");}finally{setEnquiryBusy(null);}}
 async function logout(){await fetch("/api/photographer/auth/logout",{method:"POST"});window.location.href="/photographer/login";}
 if(loading)return <PageSkeleton label="Opening your photographer workspace" variant="profile"/>;
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
      <p style={kicker}>02 — CLIENT ENQUIRIES</p><h2 style={sectionTitle}>People interested in your work</h2>
      <p style={intro}>Customer requests sent from your published profile are private to you and authorised Lens & Light support administrators. Reply to customers privately here, or use the contact details for direct follow-up.</p>
      {enquiriesLoading?<p style={note}>Loading your enquiries…</p>:enquiriesError?<p role="alert" style={note}>{enquiriesError}</p>:enquiries.length===0?<div style={emptyGallery}>No customer enquiries yet. New requests from your public profile will appear here.</div>:<div style={{display:"grid",gap:12,marginTop:16}}>{enquiries.map(item=><article key={item.enquiry_id} style={{border:"1px solid #dedbd3",background:"#fff",padding:15}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><strong>{item.customer_name}</strong><p style={note}>{item.event_type} · {item.event_location}{item.event_date?" · "+item.event_date:""}</p></div><select aria-label={"Enquiry status for "+item.customer_name} style={input} value={item.status} disabled={enquiryBusy===item.enquiry_id} onChange={e=>void updateEnquiryStatus(item.enquiry_id,e.target.value)}><option value="new">New</option><option value="in_progress">In progress</option><option value="responded">Responded</option><option value="closed">Closed</option></select></div><p style={{fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap",color:"#514d45"}}>{item.message}</p><div style={{display:"flex",gap:14,flexWrap:"wrap"}}><a href={"mailto:"+item.customer_email} style={{...note,color:"#78654d"}}>{item.customer_email}</a><a href={"tel:"+item.customer_phone.replace(/[^+\d]/g,"")} style={{...note,color:"#78654d"}}>{item.customer_phone}</a></div><small style={{...note,fontSize:9}}>{new Date(item.created_at).toLocaleString("en-KE")}</small><ClientEnquiryThread enquiryId={item.enquiry_id} audience="photographer"/></article>)}</div>}
     </section>
     <section style={{...panel,marginTop:18}}>
     <p style={kicker}>03 — PROFILE PHOTOGRAPHS</p><h2 style={sectionTitle}>Update your pictures</h2>
     <p style={intro}>Choose a new photo, adjust its position and preview the crop. Your current picture stays public until you confirm the new one.</p>
     <div style={grid}>
      <div><h3 style={subTitle}>Profile picture · Square</h3>{profile.profileImageUrl?<img src={imagePreviewUrl(profile.profileImageUrl)} alt="Current profile picture" onError={e=>handleImagePreviewError(e,profile.profileImageUrl)} style={{width:140,height:140,borderRadius:"50%",objectFit:"cover",marginBottom:12}}/>:<div style={empty}>No profile picture yet</div>}<label style={label}>Choose a new profile picture<input style={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{choose("profile",e.target.files?.[0]);e.currentTarget.value="";}}/></label></div>
      <div><h3 style={subTitle}>Cover photo · 16:9</h3>{profile.heroImageUrl?<img src={imagePreviewUrl(profile.heroImageUrl)} alt="Current cover photo" onError={e=>handleImagePreviewError(e,profile.heroImageUrl)} style={{width:"100%",aspectRatio:"16 / 9",objectFit:"cover",marginBottom:12}}/>:<div style={{...empty,aspectRatio:"16 / 9"}}>No cover photo yet</div>}<label style={label}>Choose a new cover photo<input style={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{choose("hero",e.target.files?.[0]);e.currentTarget.value="";}}/></label></div>
     </div>
     <p style={note}>JPG, PNG or WebP · Maximum 8 MB. The new photo is uploaded only after you confirm the crop.</p>
    </section>
    <section style={{...panel,marginTop:18}}>
     <p style={kicker}>04 — MY PORTFOLIO</p><h2 style={sectionTitle}>Build your gallery</h2>
     <p style={intro}>Add examples of your work. New photographs remain private until a Lens & Light administrator approves them.</p>
     <div style={grid}>
      <label style={label}>Photo title<input style={input} value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="e.g. Golden-hour portrait"/></label>
      <label style={label}>Category<input style={input} value={category} onChange={e=>setCategory(e.target.value)} maxLength={80} placeholder="Portrait, Wedding, Nature"/></label>
      <label style={{...label,gridColumn:"1 / -1"}}>Short caption<textarea style={{...input,minHeight:70}} value={caption} onChange={e=>setCaption(e.target.value)} maxLength={500} placeholder="A little context about this photograph (optional)"/></label>
     </div>
     <label style={{...label,marginTop:14}}>Choose a portfolio photograph<input style={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{selectGalleryFile(e.target.files?.[0]);e.currentTarget.value="";}}/></label>
     {fileUrl&&<div style={{maxWidth:520,marginTop:14}}><img src={fileUrl} alt="Selected portfolio image" style={{width:"100%",aspectRatio:"4 / 3",objectFit:"contain",background:"#eee9df"}}/><div style={{display:"flex",gap:10,marginTop:10}}><button type="button" style={primary} onClick={()=>file&&choose("gallery",file)}>Preview crop and continue</button><button type="button" style={secondary} onClick={()=>{URL.revokeObjectURL(fileUrl);setFileUrl("");setFile(null);}}>Cancel</button></div></div>}
     
     <h3 style={{...subTitle,marginTop:28}}>Your portfolio submissions ({gallery.length})</h3>
     {gallery.length===0?<div style={emptyGallery}>Your portfolio is ready for its first photograph. Choose an image above to get started.</div>:<div style={galleryGrid}>{gallery.map((p,i)=><article key={p.id} style={galleryCard}>
      <img src={imagePreviewUrl(p.imageUrl)} alt={p.altText||p.title||"Portfolio photograph"} onError={e=>handleImagePreviewError(e,p.imageUrl)} style={{width:"100%",aspectRatio:"4 / 3",objectFit:"cover"}}/>
      <div style={{padding:12}}><strong>{p.title||"Untitled photograph"}</strong><p style={note}>Status: {p.publishState==="PUBLISHED"?"Published":p.publishState==="PENDING_REVIEW"?"Awaiting admin approval":p.publishState==="CHANGES_REQUESTED"?"Changes requested":p.publishState}</p>{p.category&&<p style={note}>{p.category}</p>}{p.caption&&<p style={note}>{p.caption}</p>}
       {editing?.id===p.id&&<form onSubmit={savePhotoEdit} style={{display:"grid",gap:8,marginTop:10}}><div><p style={{...note,margin:"0 0 6px"}}>CURRENT UPLOADED PHOTO</p><img src={imagePreviewUrl(p.imageUrl)} alt={p.altText||p.title||"Current portfolio photograph"} onError={e=>handleImagePreviewError(e,p.imageUrl)} style={{display:"block",width:"100%",maxHeight:260,aspectRatio:"4 / 3",objectFit:"contain",background:"#eee9df",border:"1px solid #dedbd3"}}/><p style={note}>To change the actual photograph, choose a replacement below. You will review its crop before saving.</p></div><label style={label}>Title<input style={input} value={editing.title} maxLength={120} onChange={e=>setEditing(v=>v?{...v,title:e.target.value}:v)}/></label><label style={label}>Caption<textarea style={{...input,minHeight:65}} value={editing.caption} maxLength={500} onChange={e=>setEditing(v=>v?{...v,caption:e.target.value}:v)}/></label><label style={label}>Category<input style={input} value={editing.category} maxLength={80} onChange={e=>setEditing(v=>v?{...v,category:e.target.value}:v)}/></label><label style={label}>Replace image (optional)<input style={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f&&(f.size>8*1024*1024||!["image/jpeg","image/png","image/webp"].includes(f.type))){setEditMessage("Choose a JPG, PNG or WebP image up to 8 MB.");}else setEditFile(f||null);e.currentTarget.value="";}}/></label><div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button type="submit" style={primary} disabled={busy}>Save changes{editFile?" and crop image":""}</button><button type="button" style={secondary} onClick={()=>{setEditing(null);setEditFile(null);}}>Cancel</button></div></form>}<div style={{display:"flex",gap:7,marginTop:10}}><button type="button" style={small} disabled={busy} onClick={()=>{setEditing({id:p.id,title:p.title,caption:p.caption,category:p.category,altText:p.altText});setEditFile(null);setEditMessage("");}}>Edit</button><button type="button" style={small} disabled={busy||i===0} onClick={()=>void movePhoto(i,-1)} aria-label="Move up">↑</button><button type="button" style={small} disabled={busy||i===gallery.length-1} onClick={()=>void movePhoto(i,1)} aria-label="Move down">↓</button><button type="button" style={remove} disabled={busy} onClick={()=>void removePhoto(p.id)}>Remove</button></div>
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
   <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:22,flexWrap:"wrap"}}><button type="button" style={secondary} disabled={stageBusy} onClick={()=>setStage(null)}>Cancel</button><button type="button" style={primary} disabled={stageBusy} onClick={()=>void confirmStage()}>{stageBusy?"Saving image…":stage.kind==="gallery"?"Submit for admin review":stage.kind==="gallery-edit"?"Submit replacement for review":"Save new picture"}</button></div>
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
