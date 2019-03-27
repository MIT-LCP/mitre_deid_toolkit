// Copyright (C) 2012 The MITRE Corporation. See the toplevel
// file LICENSE for license terms.

import org.mitre.mist.replacement.*;
import java.util.ArrayList;
import java.util.Iterator;
// Importing MAT JSON libraries. Needed only to
// disassemble example documents.
import java.util.Hashtable;
import java.util.List;
import java.util.Set;
import org.mitre.mat.core.*;

public class MISTReplacement {

  public static void Usage() {
    System.err.println("Usage: MISTReplacement [ --task_py_dir <dir> ] [ --task_resource_dir <dir> ] jsonDoc replacer libJythonPyDir corePyDir coreResourceDir moduleName className");
    System.err.println();

    System.err.println("jsonDoc: a document in MAT JSON format");
    System.err.println("replacer: the name of a replacer, e.g. \"clear -> clear\"");
    System.err.println("libJythonPyDir: the python/ directory in src/tasks/core/standalone/lib");
    System.err.println("corePyDir: the python/ directory in src/tasks/core");
    System.err.println("coreResourceDir: the resources/ directory in src/tasks/core");
    System.err.println("moduleName: the name of the Python module which contains the specific subclass of StandaloneReplacementEngine");
    System.err.println("className: the name of the specific subclass of StandaloneReplacementEngine");

    System.err.println();

    System.err.println("--task_py_dir <d>: the python/ directory in a task. May be repeated.");
    System.err.println("--task_resource_dir <d>: the resources/ directory in a task. May be repeated.");
    System.exit(1);

  }

  public static void main(String[] args) {
    int i = 0;
    ArrayList<String> taskPyDirs = new ArrayList<String>();
    ArrayList<String> taskResourceDirs = new ArrayList<String>();
    
    while ((i < (args.length -1)) && (args[i].startsWith("--"))) {
      // Only paired arguments.
      if (args[i].equals("--task_py_dir")) {
        taskPyDirs.add(args[i + 1]);
      } else if (args[i].equals("--task_resource_dir")) {
        taskResourceDirs.add(args[i + 1]);
      } else {
        Usage();
      }
      i += 2;
    }

    if ((args.length - i) != 7) {
      Usage();
    }

    String jsonDoc = args[i];
    String replacer = args[i + 1];
    String libJythonPyDir = args[i + 2];
    String corePyDir = args[i + 3];
    String coreResourceDir = args[i + 4];
    String moduleName = args[i + 5];
    String className = args[i + 6];

    StandaloneReplacementEngineFactory f = new StandaloneReplacementEngineFactory(libJythonPyDir, corePyDir, moduleName, className,
                                                                                  taskPyDirs.toArray(new String[0]));
    
    StandaloneReplacementEngineProxyType e = f.create();

    Iterator<String> it = taskResourceDirs.iterator();
    while (it.hasNext()) {
      e.addResourceDir(it.next());
    }
    e.addResourceDir(coreResourceDir);

    // If you're using this engine in a toolchain where you're calling
    // the replacer on multiple documents, the section above should be
    // in the tool initializer. Reusing the StandaloneReplacementEngineProxyType
    // instance will pay off handsomely in terms of the initialization of
    // the replacement resources.

    // We digest the jsonDoc using the MAT library. In your own application,
    // you'll be using your own document readers and accessors.

    MATJSONEncoding j = new MATJSONEncoding();

    MATDocument d = new MATDocument();

    try {
      j.fromFile(d, jsonDoc);
    } catch (MATDocumentException err) {
      System.err.println("Encountered error in reading the document: " + err.getMessage());
      System.exit(1);
    }
    
    JavaStandaloneReplacementEngineEventType evt = e.newEventInJava(d.getSignal());
    
    // add the tuples.

    Set<String> atypeList = d.getAnnotationTypes();
    for (Iterator<String> it2 = atypeList.iterator(); it2.hasNext();) {
      String label = it2.next();
      List<AnnotationCore> annots = d.getAnnotationsOfType(label);
      for (int k = 0; k < annots.size(); k++) {
        AnnotationCore a = annots.get(k);
        if (a instanceof Annotation) {
          int start = ((Annotation) a).getStartIndex();
          int end = ((Annotation) a).getEndIndex();
          // This is the call you need - everything else in this section
          // is just deconstructing the MAT annotations.
          evt.addTuple(label, start, end);
        }
      }
    }

    // Then convert.

    evt.convert(replacer);

    System.out.println(evt.getReplacedSignal());
    
  }
}
