"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2 } from "lucide-react";

const styles=["Weddings","Portraits","Commercial","Events","Fashion & editorial","Family","Product","Travel & lifestyle"];
export default function PhotographerApplyPage(){
  const [submitted,setSubmitted]=useState(false);
  const [categoryError,setCategoryError]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  function toggle(value:string){setSelected(current=>current.includes(value)?current.filter(x=>x!==value):[...current,value]);}
  return <main className="directory-page apply-page">
    <header className="market-header"><Link href="/" className="market-brand"><span className="brand-mark"><Camera size={19}/></span><span>LENS <i>&</i> LIGHT</span></Link><nav><Link href="/photographers">Find a photographer</Link><Link href="/#how-it-works">How it works</Link><Link href="/#for-photographers">For photographers</Link></nav><Link className="header-cta" href="/photographers">Explore directory <ArrowRight size={15}/></Link></header>
    <section className="apply-intro"><Link href="/" className="back-link"><ArrowLeft size={15}/> BACK HOME</Link><p className="kicker">LENS & LIGHT · PHOTOGRAPHER COMMUNITY</p><h1>Let your work<br/><em>find its people.</em></h1><p>Tell us a little about yourself, the work you love making and where you make it. We’re building a thoughtful directory for photographers and the people looking for them.</p></section>
    <section className="apply-layout"><aside className="apply-aside"><span className="apply-number">01 / GET TO KNOW YOU</span><h2>A good introduction<br/>starts a conversation.</h2><p>This application preview helps shape the information we’ll need to create a complete photographer profile.</p><ul><li>Share your photography focus</li><li>Tell us where you’re based</li><li>Link to work you’re proud of</li></ul><p className="apply-note">PREVIEW ONLY · Nothing entered here is sent or stored yet.</p></aside>
    <form className="apply-form" onSubmit={e=>{e.preventDefault();if(selected.length===0){setCategoryError(true);return;}setCategoryError(false);setSubmitted(true);}}>
      <div className="form-heading"><span>YOUR DETAILS</span><span>01 — 03</span></div>
      <div className="apply-fields two-col"><label>Photographer / studio name <span className="required-mark">*</span><input required placeholder="Your name or studio"/></label><label>Email address <span className="required-mark">*</span><input required type="email" placeholder="you@example.com"/></label><label>Phone number <span className="required-mark">*</span><input required type="tel" placeholder="+254 7XX XXX XXX"/></label><label>Website<input type="url" placeholder="https://yourwebsite.com"/></label><label>Town / city <span className="required-mark">*</span><input required placeholder="e.g. Nairobi"/></label><label>County / region <span className="required-mark">*</span><input required placeholder="e.g. Nairobi County"/></label></div>
      <div className="form-heading"><span>YOUR PHOTOGRAPHY</span><span>02 — 03</span></div>
      <label className="wide-label">What do you photograph? <span className="required-mark">*</span> <span className="field-hint">Choose all that apply</span></label>
      <div className="style-options">{styles.map(s=><button type="button" key={s} className={selected.includes(s)?"chosen":""} onClick={()=>toggle(s)}>{selected.includes(s)?"✓　":""}{s}</button>)}</div>
      {categoryError&&<p className="category-error" role="alert">Please select at least one photography category.</p>}
      <label className="wide-label">A short introduction <span className="required-mark">*</span><textarea required rows={5} placeholder="Tell clients about your approach, experience and the stories you love to capture."/></label>
      <label className="wide-label">Areas you serve <span className="required-mark">*</span><textarea required rows={2} placeholder="List towns, counties or destinations you travel to."/></label>
      <div className="form-heading"><span>SHOW US YOUR WORK</span><span>03 — 03</span></div>
      <div className="apply-fields two-col"><label>Portfolio link <span className="required-mark">*</span><input required type="url" placeholder="https://..."/></label><label>Instagram handle <span className="required-mark">*</span><input required placeholder="@yourstudio"/></label><label>Additional gallery link <span className="required-mark">*</span><input required type="url" placeholder="https://..."/></label><label>Other social / profile link <span className="required-mark">*</span><input required type="url" placeholder="https://..."/></label></div>
      <label className="consent-row"><input type="checkbox" required/> I confirm that the information and portfolio links I provide are mine to share. <span className="required-mark">*</span></label>
      <button className="button-dark apply-submit" type="submit">Preview application <ArrowRight size={16}/></button>
      {submitted&&<p className="preview-feedback"><CheckCircle2 size={17}/> Your details passed the on-page preview check. This form is not connected to submission or storage yet, so nothing has been sent.</p>}
      <p className="form-footnote">All fields are required except the website field. Your application will only be submitted once the platform’s secure application service is connected.</p>
    </form></section>
    <footer className="market-footer"><Link href="/" className="market-brand"><span className="brand-mark"><Camera size={18}/></span><span>LENS <i>&</i> LIGHT</span></Link><span>PHOTOGRAPHY, WITH PEOPLE AT ITS HEART.</span><div><Link href="/photographers">DISCOVER</Link><Link href="/#for-photographers">JOIN US</Link></div><small>© {new Date().getFullYear()} LENS & LIGHT. ALL RIGHTS RESERVED.</small></footer>
  </main>;
}